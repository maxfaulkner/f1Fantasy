import SwiftUI

// MARK: - ViewModel

@MainActor
@Observable
final class RaceResultsViewModel {
    var schedule: [JolpicaRace] = []
    var selectedRound: Int = 0          // 0 = not yet set
    var selectedSession: Session = .race
    var topTab: TopTab = .results

    var raceResults: [JolpicaResult] = []
    var sprintResults: [JolpicaResult] = []
    var qualifyingResults: [JolpicaQualifyingResult] = []
    var driverStandings: [JolpicaDriverStanding] = []
    var constructorStandings: [JolpicaConstructorStanding] = []
    var standingsTab: StandingsTab = .drivers

    var isLoadingSchedule = false
    var isLoadingSession = false
    var isLoadingStandings = false
    var errorMessage: String?
    var sessionError: String?

    // Live timing: true when the currently-selected round's race day is today ± 12h
    var isLive: Bool {
        guard let race = currentRace else { return false }
        let fmt = DateFormatter(); fmt.dateFormat = "yyyy-MM-dd"
        guard let raceDate = fmt.date(from: race.date) else { return false }
        let diff = abs(raceDate.timeIntervalSinceNow)
        return diff < 12 * 3600 // within 12 hours of race date
    }

    private var livePollingTask: Task<Void, Never>?

    enum TopTab { case results, standings }
    enum Session: String, CaseIterable { case race = "Race"; case qualifying = "Qualifying"; case sprint = "Sprint" }
    enum StandingsTab: String, CaseIterable { case drivers = "Drivers"; case constructors = "Constructors" }

    private let season = Calendar.current.component(.year, from: Date())
    private let base = "https://api.jolpi.ca/ergast/f1"

    var currentRace: JolpicaRace? { schedule.first(where: { $0.roundInt == selectedRound }) }
    var availableSessions: [Session] {
        guard let race = currentRace else { return [.race, .qualifying] }
        return race.hasSprint ? [.race, .qualifying, .sprint] : [.race, .qualifying]
    }

    func loadSchedule() async {
        guard schedule.isEmpty else { return }
        isLoadingSchedule = true
        errorMessage = nil
        do {
            let url = URL(string: "\(base)/\(season).json")!
            let (data, _) = try await URLSession.shared.data(from: url)
            let response = try JSONDecoder().decode(JolpicaScheduleResponse.self, from: data)
            schedule = response.mrData.raceTable?.races ?? []
            // Default to most recent completed round
            let now = Date()
            let fmt = DateFormatter(); fmt.dateFormat = "yyyy-MM-dd"
            let lastCompleted = schedule.last(where: { fmt.date(from: $0.date).map { $0 < now } ?? false })
            selectedRound = lastCompleted?.roundInt ?? schedule.first?.roundInt ?? 1
        } catch { errorMessage = error.localizedDescription }
        isLoadingSchedule = false
    }

    func loadSession() async {
        guard selectedRound > 0 else { return }
        isLoadingSession = true
        sessionError = nil
        do {
            switch selectedSession {
            case .race:
                let url = URL(string: "\(base)/\(season)/\(selectedRound)/results.json")!
                let (data, _) = try await URLSession.shared.data(from: url)
                let response = try JSONDecoder().decode(JolpicaResultsResponse.self, from: data)
                raceResults = response.mrData.raceTable.races.first?.results ?? []
            case .sprint:
                let url = URL(string: "\(base)/\(season)/\(selectedRound)/sprint.json")!
                let (data, _) = try await URLSession.shared.data(from: url)
                let response = try JSONDecoder().decode(JolpicaResultsResponse.self, from: data)
                sprintResults = response.mrData.raceTable.races.first?.sprintResults ?? []
            case .qualifying:
                let url = URL(string: "\(base)/\(season)/\(selectedRound)/qualifying.json")!
                let (data, _) = try await URLSession.shared.data(from: url)
                let response = try JSONDecoder().decode(JolpicaQualifyingResponse.self, from: data)
                qualifyingResults = response.mrData.raceTable.races.first?.qualifyingResults ?? []
            }
        } catch is URLError {
            sessionError = "Could not load results. Check your connection and try again."
        } catch {
            // Decode error → results not published yet, show empty state
        }
        isLoadingSession = false
    }

    func loadStandings() async {
        guard driverStandings.isEmpty && constructorStandings.isEmpty else { return }
        isLoadingStandings = true
        async let driversData = fetchDriverStandings()
        async let constructorsData = fetchConstructorStandings()
        let (d, c) = await (driversData, constructorsData)
        driverStandings = d
        constructorStandings = c
        isLoadingStandings = false
    }

    private func fetchDriverStandings() async -> [JolpicaDriverStanding] {
        let url = URL(string: "\(base)/\(season)/driverstandings.json")!
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let response = try? JSONDecoder().decode(JolpicaStandingsResponse.self, from: data) else { return [] }
        return response.mrData.standingsTable.standingsLists.first?.driverStandings ?? []
    }

    private func fetchConstructorStandings() async -> [JolpicaConstructorStanding] {
        let url = URL(string: "\(base)/\(season)/constructorstandings.json")!
        guard let (data, _) = try? await URLSession.shared.data(from: url),
              let response = try? JSONDecoder().decode(JolpicaStandingsResponse.self, from: data) else { return [] }
        return response.mrData.standingsTable.standingsLists.first?.constructorStandings ?? []
    }

    func selectRound(_ round: Int) async {
        selectedRound = round
        raceResults = []
        sprintResults = []
        qualifyingResults = []
        sessionError = nil
        // If sprint not available for this round, fall back to race
        if selectedSession == .sprint && !(currentRace?.hasSprint ?? false) {
            selectedSession = .race
        }
        await loadSession()
    }

    func selectSession(_ session: Session) async {
        selectedSession = session
        sessionError = nil
        await loadSession()
    }

    // MARK: - Live Polling

    func startLivePollingIfNeeded() {
        guard isLive else { return }
        livePollingTask?.cancel()
        livePollingTask = Task {
            while !Task.isCancelled && isLive {
                do {
                    try await Task.sleep(for: .seconds(60))
                    if !Task.isCancelled { await loadSession() }
                } catch { break }
            }
        }
    }

    func stopLivePolling() {
        livePollingTask?.cancel()
        livePollingTask = nil
    }
}

// MARK: - Root View

struct RaceResultsView: View {
    @State private var vm = RaceResultsViewModel()

    var body: some View {
        NavigationStack {
            ZStack {
                Color.appBackground.ignoresSafeArea()

                if vm.isLoadingSchedule {
                    LoadingView()
                } else if let err = vm.errorMessage, vm.schedule.isEmpty {
                    ErrorView(message: err) { Task { await vm.loadSchedule() } }
                } else {
                    VStack(spacing: 0) {
                        // Top tab: Results vs Standings
                        Picker("", selection: $vm.topTab) {
                            Text("Session Results").tag(RaceResultsViewModel.TopTab.results)
                            Text("Championship").tag(RaceResultsViewModel.TopTab.standings)
                        }
                        .pickerStyle(.segmented)
                        .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 8)

                        if vm.topTab == .results {
                            SessionResultsView(vm: vm)
                        } else {
                            ChampionshipView(vm: vm)
                        }
                    }
                }
            }
            .navigationTitle("Results")
            .toolbar {
                if vm.isLive {
                    ToolbarItem(placement: .topBarTrailing) {
                        HStack(spacing: 4) {
                            Circle().fill(Color.appRed).frame(width: 7, height: 7)
                            Text("LIVE")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(.appRed)
                        }
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Color.appRed.opacity(0.12))
                        .clipShape(Capsule())
                    }
                }
            }
            .task {
                await vm.loadSchedule()
                guard !vm.schedule.isEmpty else { return }
                await vm.loadSession()
                vm.startLivePollingIfNeeded()
            }
            .onDisappear { vm.stopLivePolling() }
            .onChange(of: vm.selectedRound) { _, _ in
                vm.stopLivePolling()
                vm.startLivePollingIfNeeded()
            }
            .onChange(of: vm.topTab) { _, tab in
                if tab == .standings { Task { await vm.loadStandings() } }
            }
            .refreshable {
                vm.schedule = []
                vm.raceResults = []
                vm.sprintResults = []
                vm.qualifyingResults = []
                vm.driverStandings = []
                vm.constructorStandings = []
                vm.sessionError = nil
                await vm.loadSchedule()
                if vm.topTab == .results { await vm.loadSession() }
                else { await vm.loadStandings() }
            }
        }
    }
}

// MARK: - Session Results

struct SessionResultsView: View {
    let vm: RaceResultsViewModel

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                // Round picker
                roundPicker

                // Race name header
                if let race = vm.currentRace {
                    VStack(spacing: 2) {
                        Text(race.raceName)
                            .font(.headline).fontWeight(.bold).foregroundStyle(.appTextPrimary)
                        Text("\(race.circuit.location.locality), \(race.circuit.location.country)")
                            .font(.caption).foregroundStyle(.appTextDim)
                    }
                    .frame(maxWidth: .infinity)
                }

                // Session picker
                Picker("", selection: Binding(
                    get: { vm.selectedSession },
                    set: { session in Task { await vm.selectSession(session) } }
                )) {
                    ForEach(vm.availableSessions, id: \.self) { s in
                        Text(s.rawValue).tag(s)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)

                if vm.isLoadingSession {
                    ProgressView().padding(40)
                } else if let err = vm.sessionError {
                    ErrorView(message: err) { Task { await vm.loadSession() } }
                        .frame(minHeight: 200)
                } else {
                    sessionContent
                }
            }
            .padding(.bottom, 32)
        }
    }

    @ViewBuilder
    private var sessionContent: some View {
        switch vm.selectedSession {
        case .race:
            raceContent(vm.raceResults)
        case .sprint:
            raceContent(vm.sprintResults)
        case .qualifying:
            qualifyingContent
        }
    }

    @ViewBuilder
    private func raceContent(_ results: [JolpicaResult]) -> some View {
        if results.isEmpty {
            emptyState("Results not available yet")
        } else {
            // Podium
            if results.count >= 3 {
                JolpicaPodiumView(top3: Array(results.prefix(3)))
                    .padding(.horizontal, 16)
            }

            // Full classified order
            VStack(spacing: 0) {
                ForEach(Array(results.enumerated()), id: \.element.id) { i, result in
                    RaceResultRow(result: result)
                    if i < results.count - 1 {
                        Color.appBorder.frame(height: 0.5).padding(.leading, 56)
                    }
                }
            }
            .background(Color.appCard)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 16)
        }
    }

    private var qualifyingContent: some View {
        Group {
            if vm.qualifyingResults.isEmpty {
                emptyState("Qualifying results not available yet")
            } else {
                VStack(spacing: 0) {
                    // Header
                    HStack(spacing: 8) {
                        Text("P").frame(width: 24)
                        Text("").frame(width: 3)
                        Text("Driver").frame(width: 90, alignment: .leading)
                        Text("Q1").frame(maxWidth: .infinity, alignment: .trailing)
                        Text("Q2").frame(maxWidth: .infinity, alignment: .trailing)
                        Text("Q3").frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.appTextFaint)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .textCase(.uppercase)
                    .tracking(0.5)

                    Color.appBorder.frame(height: 0.5)

                    ForEach(Array(vm.qualifyingResults.enumerated()), id: \.element.id) { i, result in
                        QualifyingResultRow(result: result)
                        if i < vm.qualifyingResults.count - 1 {
                            Color.appBorder.frame(height: 0.5).padding(.leading, 56)
                        }
                    }
                }
                .background(Color.appCard)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 16)
            }
        }
    }

    private func emptyState(_ message: String) -> some View {
        VStack(spacing: 12) {
            Text("🏁").font(.system(size: 40))
            Text(message).font(.subheadline).foregroundStyle(.appTextDim)
        }
        .frame(maxWidth: .infinity)
        .padding(48)
    }

    private var roundPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(vm.schedule) { race in
                    RoundPill(
                        race: race,
                        isSelected: vm.selectedRound == race.roundInt
                    ) {
                        Task { await vm.selectRound(race.roundInt) }
                    }
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 4)
        }
    }
}

struct RoundPill: View {
    let race: JolpicaRace
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 2) {
                Text("R\(race.round)")
                    .font(.system(size: 11, weight: .bold))
                Text(race.circuit.location.country)
                    .font(.system(size: 9))
                    .lineLimit(1)
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(isSelected ? Color.appRed : Color.appCard)
            .foregroundStyle(isSelected ? Color.white : Color.appTextDim)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Podium

struct JolpicaPodiumView: View {
    let top3: [JolpicaResult]

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            podiumCard(top3[1], position: 2, height: 70)
            podiumCard(top3[0], position: 1, height: 90)
            podiumCard(top3[2], position: 3, height: 55)
        }
        .padding(.vertical, 8)
    }

    private func podiumCard(_ result: JolpicaResult, position: Int, height: CGFloat) -> some View {
        VStack(spacing: 5) {
            if position == 1 {
                Image(systemName: "crown.fill").foregroundStyle(.appGold).font(.caption)
            }
            Circle()
                .fill(constructorColor(for: result.constructor.name))
                .frame(width: position == 1 ? 44 : 36, height: position == 1 ? 44 : 36)
                .overlay(
                    Text(result.driver.abbreviation)
                        .font(.system(size: position == 1 ? 11 : 9, weight: .bold))
                        .foregroundStyle(.white)
                )
            Text(result.driver.familyName)
                .font(.caption2).fontWeight(.semibold).foregroundStyle(.appTextPrimary).lineLimit(1)
            Text(result.constructor.name)
                .font(.system(size: 9)).foregroundStyle(.appTextDim).lineLimit(1)
            if let t = result.time?.time {
                Text(t).font(.system(size: 9, weight: .medium)).foregroundStyle(.appGold).lineLimit(1)
            }
            RoundedRectangle(cornerRadius: 6)
                .fill(position == 1 ? Color.appGold.opacity(0.2) : Color.appCardRaised)
                .frame(height: height)
                .overlay(
                    Text("P\(position)").font(.title3).fontWeight(.bold)
                        .foregroundStyle(position == 1 ? .appGold : position == 2 ? Color(hex: "C0C0C0") : Color(hex: "CD7F32"))
                )
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Race Result Row

struct RaceResultRow: View {
    let result: JolpicaResult

    private var positionColor: Color {
        switch result.positionInt {
        case 1: return .appGold
        case 2: return Color(hex: "C0C0C0")
        case 3: return Color(hex: "CD7F32")
        default: return .appTextDim
        }
    }

    var body: some View {
        NavigationLink(destination: DriverSeasonView(driver: result.driver, constructorName: result.constructor.name)) {
            HStack(spacing: 10) {
                Text(result.isFinished ? "\(result.position)" : result.positionText)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(positionColor)
                    .frame(width: 28, alignment: .center)

                RoundedRectangle(cornerRadius: 2)
                    .fill(constructorColor(for: result.constructor.name))
                    .frame(width: 3, height: 34)

                VStack(alignment: .leading, spacing: 1) {
                    Text(result.driver.fullName)
                        .font(.subheadline).fontWeight(.semibold).foregroundStyle(.appTextPrimary)
                        .lineLimit(1)
                    NavigationLink(destination: ConstructorSeasonView(constructor: result.constructor)) {
                        Text(result.constructor.name)
                            .font(.caption2).foregroundStyle(.appRed)
                    }
                }

                Spacer()

                if let delta = result.positionDelta, result.isFinished, delta != 0 {
                    HStack(spacing: 2) {
                        Image(systemName: delta > 0 ? "arrow.up" : "arrow.down")
                            .font(.system(size: 8, weight: .bold))
                        Text("\(abs(delta))").font(.system(size: 9, weight: .bold))
                    }
                    .foregroundStyle(delta > 0 ? Color.appSuccess : Color.appError)
                    .padding(.horizontal, 4).padding(.vertical, 2)
                    .background(delta > 0 ? Color.appSuccess.opacity(0.12) : Color.appError.opacity(0.12))
                    .clipShape(Capsule())
                }

                VStack(alignment: .trailing, spacing: 1) {
                    if result.isFinished, let t = result.time?.time {
                        Text(t).font(.system(size: 11, weight: .medium)).foregroundStyle(.appTextDim)
                    } else {
                        Text(result.status).font(.system(size: 10)).foregroundStyle(.appError).lineLimit(1)
                    }
                    Text("\(result.points) pts")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(result.pointsDouble > 0 ? .appTextPrimary : .appTextFaint)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Qualifying Row

struct QualifyingResultRow: View {
    let result: JolpicaQualifyingResult

    private var positionColor: Color {
        switch result.positionInt {
        case 1: return .appGold
        case 2: return Color(hex: "C0C0C0")
        case 3: return Color(hex: "CD7F32")
        default: return .appTextDim
        }
    }

    var body: some View {
        NavigationLink(destination: DriverSeasonView(driver: result.driver, constructorName: result.constructor.name)) {
            HStack(spacing: 8) {
                Text("\(result.position)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(positionColor)
                    .frame(width: 24, alignment: .center)

                RoundedRectangle(cornerRadius: 2)
                    .fill(constructorColor(for: result.constructor.name))
                    .frame(width: 3, height: 34)

                VStack(alignment: .leading, spacing: 1) {
                    Text(result.driver.familyName)
                        .font(.subheadline).fontWeight(.semibold).foregroundStyle(.appTextPrimary)
                        .lineLimit(1)
                        .fixedSize(horizontal: false, vertical: true)
                        .environment(\.layoutDirection, .leftToRight)
                    Text(result.constructor.name)
                        .font(.caption2).foregroundStyle(.appTextDim)
                        .lineLimit(1)
                }
                .frame(width: 90, alignment: .leading)

                HStack(spacing: 0) {
                    lapTime(result.q1, active: result.positionInt > 10)
                    lapTime(result.q2, active: result.positionInt > 5)
                    lapTime(result.q3, active: result.positionInt <= 10)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
        }
        .buttonStyle(.plain)
    }

    private func lapTime(_ time: String?, active: Bool) -> some View {
        Text(time ?? "—")
            .font(.system(size: 10, weight: active ? .bold : .regular, design: .monospaced))
            .foregroundStyle(active && time != nil ? .appTextPrimary : .appTextFaint)
            .frame(maxWidth: .infinity, alignment: .trailing)
    }
}

// MARK: - Championship View

struct ChampionshipView: View {
    let vm: RaceResultsViewModel

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Picker("", selection: Binding(
                    get: { vm.standingsTab },
                    set: { vm.standingsTab = $0 }
                )) {
                    ForEach(RaceResultsViewModel.StandingsTab.allCases, id: \.self) { tab in
                        Text(tab.rawValue).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16).padding(.top, 4)

                if vm.isLoadingStandings {
                    ProgressView().padding(40)
                } else if vm.standingsTab == .drivers {
                    driverStandings
                } else {
                    constructorStandings
                }
            }
            .padding(.bottom, 32)
        }
    }

    private var driverStandings: some View {
        Group {
            if vm.driverStandings.isEmpty {
                emptyState("Standings not available yet")
            } else {
                // Podium top 3
                if vm.driverStandings.count >= 3 {
                    StandingsPodiumView(
                        first: vm.driverStandings[0].driver.fullName,
                        firstPts: vm.driverStandings[0].points,
                        firstColor: constructorColor(for: vm.driverStandings[0].constructor?.name),
                        second: vm.driverStandings[1].driver.fullName,
                        secondPts: vm.driverStandings[1].points,
                        secondColor: constructorColor(for: vm.driverStandings[1].constructor?.name),
                        third: vm.driverStandings[2].driver.fullName,
                        thirdPts: vm.driverStandings[2].points,
                        thirdColor: constructorColor(for: vm.driverStandings[2].constructor?.name)
                    )
                    .padding(.horizontal, 16)
                }

                VStack(spacing: 0) {
                    ForEach(Array(vm.driverStandings.enumerated()), id: \.element.id) { i, standing in
                        DriverStandingRow(standing: standing)
                        if i < vm.driverStandings.count - 1 {
                            Color.appBorder.frame(height: 0.5).padding(.leading, 56)
                        }
                    }
                }
                .background(Color.appCard)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 16)
            }
        }
    }

    private var constructorStandings: some View {
        Group {
            if vm.constructorStandings.isEmpty {
                emptyState("Standings not available yet")
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(vm.constructorStandings.enumerated()), id: \.element.id) { i, standing in
                        ConstructorStandingRow(standing: standing)
                        if i < vm.constructorStandings.count - 1 {
                            Color.appBorder.frame(height: 0.5).padding(.leading, 56)
                        }
                    }
                }
                .background(Color.appCard)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 16)
            }
        }
    }

    private func emptyState(_ message: String) -> some View {
        VStack(spacing: 12) {
            Text("🏆").font(.system(size: 40))
            Text(message).font(.subheadline).foregroundStyle(.appTextDim)
        }
        .frame(maxWidth: .infinity)
        .padding(48)
    }
}

struct StandingsPodiumView: View {
    let first: String; let firstPts: String; let firstColor: Color
    let second: String; let secondPts: String; let secondColor: Color
    let third: String; let thirdPts: String; let thirdColor: Color

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            podiumCard(name: second, pts: secondPts, color: secondColor, position: 2, height: 65)
            podiumCard(name: first,  pts: firstPts,  color: firstColor,  position: 1, height: 85)
            podiumCard(name: third,  pts: thirdPts,  color: thirdColor,  position: 3, height: 50)
        }
        .padding(.vertical, 8)
    }

    private func podiumCard(name: String, pts: String, color: Color, position: Int, height: CGFloat) -> some View {
        VStack(spacing: 5) {
            if position == 1 { Image(systemName: "crown.fill").foregroundStyle(.appGold).font(.caption) }
            Circle().fill(color)
                .frame(width: position == 1 ? 44 : 36, height: position == 1 ? 44 : 36)
                .overlay(Text(String(name.split(separator: " ").last?.prefix(3) ?? "?").uppercased())
                    .font(.system(size: 10, weight: .bold)).foregroundStyle(.white))
            Text(name.components(separatedBy: " ").last ?? name)
                .font(.caption2).fontWeight(.semibold).foregroundStyle(.appTextPrimary).lineLimit(1)
            Text("\(pts) pts").font(.system(size: 10, weight: .bold)).foregroundStyle(.appGold)
            RoundedRectangle(cornerRadius: 6)
                .fill(position == 1 ? Color.appGold.opacity(0.2) : Color.appCardRaised)
                .frame(height: height)
                .overlay(Text("P\(position)").font(.title3).fontWeight(.bold)
                    .foregroundStyle(position == 1 ? .appGold : position == 2 ? Color(hex: "C0C0C0") : Color(hex: "CD7F32")))
        }
        .frame(maxWidth: .infinity)
    }
}

struct DriverStandingRow: View {
    let standing: JolpicaDriverStanding

    var body: some View {
        NavigationLink(destination: DriverSeasonView(driver: standing.driver, constructorName: standing.constructor?.name ?? "")) {
            HStack(spacing: 10) {
                Text("\(standing.position)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(standing.positionInt <= 3 ? .appGold : .appTextDim)
                    .frame(width: 28, alignment: .center)

                RoundedRectangle(cornerRadius: 2)
                    .fill(constructorColor(for: standing.constructor?.name))
                    .frame(width: 3, height: 34)

                VStack(alignment: .leading, spacing: 1) {
                    Text(standing.driver.fullName)
                        .font(.subheadline).fontWeight(.semibold).foregroundStyle(.appTextPrimary)
                        .lineLimit(1)
                    Text(standing.constructor?.name ?? "")
                        .font(.caption2).foregroundStyle(.appTextDim)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 1) {
                    Text("\(standing.points) pts")
                        .font(.system(size: 14, weight: .bold)).foregroundStyle(.appTextPrimary)
                    if standing.winsInt > 0 {
                        Text("\(standing.wins) win\(standing.winsInt == 1 ? "" : "s")")
                            .font(.caption2).foregroundStyle(.appGold)
                    }
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
        }
        .buttonStyle(.plain)
    }
}

struct ConstructorStandingRow: View {
    let standing: JolpicaConstructorStanding

    var body: some View {
        NavigationLink(destination: ConstructorSeasonView(constructor: standing.constructor)) {
            HStack(spacing: 10) {
                Text("\(standing.position)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(standing.positionInt <= 3 ? .appGold : .appTextDim)
                    .frame(width: 28, alignment: .center)

                RoundedRectangle(cornerRadius: 2)
                    .fill(constructorColor(for: standing.constructor.name))
                    .frame(width: 3, height: 34)

                VStack(alignment: .leading, spacing: 1) {
                    Text(standing.constructor.name)
                        .font(.subheadline).fontWeight(.semibold).foregroundStyle(.appTextPrimary)
                        .lineLimit(1)
                    Text(standing.constructor.nationality ?? "")
                        .font(.caption2).foregroundStyle(.appTextDim)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 1) {
                    Text("\(standing.points) pts")
                        .font(.system(size: 14, weight: .bold)).foregroundStyle(.appTextPrimary)
                    if Int(standing.wins) ?? 0 > 0 {
                        Text("\(standing.wins) win\(Int(standing.wins) == 1 ? "" : "s")")
                            .font(.caption2).foregroundStyle(.appGold)
                    }
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 9)
        }
        .buttonStyle(.plain)
    }
}
