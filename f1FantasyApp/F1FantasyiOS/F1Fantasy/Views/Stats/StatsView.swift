import SwiftUI
import Charts

struct StatsView: View {
    let leagueId: String
    let currentWeek: Int
    @State private var vm = StatsViewModel()

    var body: some View {
        ZStack {
            Color.appBackground.ignoresSafeArea()
            Group {
                if vm.isLoading { LoadingView() }
                else if let err = vm.errorMessage { ErrorView(message: err) { Task { await vm.load(leagueId: leagueId, week: currentWeek) } } }
                else { content }
            }
        }
        .navigationTitle("Stats")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(destination: TeamHistoryView(leagueId: leagueId, latestWeek: currentWeek)) {
                    Image(systemName: "clock.arrow.circlepath")
                        .foregroundStyle(.appRed)
                }
            }
        }
        .task {
            await vm.load(leagueId: leagueId, week: currentWeek)
            await vm.fetchOptimalTeam(leagueId: leagueId, week: currentWeek)
        }
        .refreshable {
            await vm.load(leagueId: leagueId, week: currentWeek)
            await vm.fetchOptimalTeam(leagueId: leagueId, week: currentWeek)
        }
    }

    private var content: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Tab toggle
                Picker("", selection: $vm.activeTab) {
                    Text("Performance").tag(StatsViewModel.StatsTab.performance)
                    Text("Prices").tag(StatsViewModel.StatsTab.prices)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                if vm.activeTab == .performance {
                    performanceContent
                } else {
                    PriceWatchView(drivers: vm.driverForm, constructors: vm.constructorForm)
                }
            }
            .padding(.top, 16)
        }
    }

    private var performanceContent: some View {
        VStack(spacing: 16) {
            // Summary cards
            if let stats = vm.stats {
                HStack(spacing: 12) {
                    StatCard(title: "Total", value: "\(stats.totalPoints)")
                    StatCard(title: "Avg / Round", value: "\(stats.avgPoints)")
                    StatCard(title: "Rounds", value: "\(stats.roundsPlayed)")
                }
                .padding(.horizontal)

                // Cumulative line chart
                if !stats.rounds.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Season Progress")
                            .font(.subheadline).fontWeight(.semibold).foregroundStyle(.appTextPrimary)
                        Chart(stats.rounds) { round in
                            LineMark(
                                x: .value("Round", round.week),
                                y: .value("Points", round.cumulative)
                            )
                            .foregroundStyle(Color.appRed)
                            .interpolationMethod(.catmullRom)
                            AreaMark(
                                x: .value("Round", round.week),
                                yStart: .value("Base", 0),
                                yEnd: .value("Points", round.cumulative)
                            )
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [Color.appRed.opacity(0.3), .clear],
                                    startPoint: .top, endPoint: .bottom
                                )
                            )
                        }
                        .frame(height: 180)
                        .chartXAxis {
                            AxisMarks(values: .automatic) { _ in
                                AxisValueLabel().foregroundStyle(Color.appTextDim)
                                AxisGridLine().foregroundStyle(Color.appBorder)
                            }
                        }
                        .chartYAxis {
                            AxisMarks { _ in
                                AxisValueLabel().foregroundStyle(Color.appTextDim)
                                AxisGridLine().foregroundStyle(Color.appBorder)
                            }
                        }
                    }
                    .cardStyle()
                    .padding(.horizontal)

                    // Round bars
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Round by Round")
                            .font(.subheadline).fontWeight(.semibold).foregroundStyle(.appTextPrimary)
                        Chart(stats.rounds) { round in
                            BarMark(
                                x: .value("Round", round.week),
                                y: .value("Points", round.points)
                            )
                            .foregroundStyle(round.chipUsed != nil ? Color.appGold : Color.appRed)
                            .annotation(position: .top) {
                                if let chip = round.chipUsed {
                                    Text(chipEmoji(chip)).font(.system(size: 10))
                                }
                            }
                        }
                        .frame(height: 140)
                        .chartXAxis {
                            AxisMarks { _ in
                                AxisValueLabel().foregroundStyle(Color.appTextDim)
                            }
                        }
                        .chartYAxis {
                            AxisMarks { _ in
                                AxisValueLabel().foregroundStyle(Color.appTextDim)
                                AxisGridLine().foregroundStyle(Color.appBorder)
                            }
                        }
                    }
                    .cardStyle()
                    .padding(.horizontal)
                }

                // Best Possible Team (hindsight) for the latest round
                if let lastRound = stats.rounds.last,
                   vm.optimalTeam != nil || vm.optimalTeamError != nil {
                    HindsightTeamView(
                        userPoints: lastRound.points,
                        optimalTeam: vm.optimalTeam,
                        isLoading: vm.isLoadingOptimal,
                        errorMessage: vm.optimalTeamError,
                        isExpanded: $vm.hindsightExpanded
                    )
                    .padding(.horizontal)
                }
            }
        }
    }
}

// MARK: - Hindsight card

struct HindsightTeamView: View {
    let userPoints: Int
    let optimalTeam: OptimalTeamResponse?
    let isLoading: Bool
    let errorMessage: String?
    @Binding var isExpanded: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { isExpanded.toggle() }
            } label: {
                HStack {
                    Label("Best Possible Team", systemImage: "trophy.fill")
                        .font(.subheadline).fontWeight(.semibold).foregroundStyle(.appTextPrimary)
                    Spacer()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption).foregroundStyle(.appTextDim)
                }
            }
            .buttonStyle(.plain)

            if isLoading {
                Text("Loading Dream Team…")
                    .font(.caption).foregroundStyle(.appTextDim)
            } else if let msg = errorMessage {
                Text(msg).font(.caption).foregroundStyle(.appError)
            } else if let optimal = optimalTeam {
                let delta = optimal.totalPoints - userPoints
                Group {
                    if delta > 0 {
                        Text("You scored \(userPoints) pts · Best possible: \(optimal.totalPoints) pts (\(delta) pts left on the table)")
                    } else if delta < 0 {
                        Text("You scored \(userPoints) pts · Best possible: \(optimal.totalPoints) pts")
                    } else {
                        Text("You scored \(userPoints) pts · You matched the Dream Team!")
                    }
                }
                .font(.caption)
                .foregroundStyle(delta > 0 ? Color.appError : Color.appSuccess)

                if isExpanded {
                    VStack(spacing: 4) {
                        ForEach(optimal.drivers) { driver in
                            HStack {
                                Text(driver.name).font(.caption).foregroundStyle(.appTextPrimary)
                                Spacer()
                                Text("$\(driver.price, specifier: "%.1f")M")
                                    .font(.caption2).foregroundStyle(.appTextDim)
                                Text("\(driver.points) pts")
                                    .font(.caption).fontWeight(.semibold)
                                    .foregroundStyle(driver.points >= 0 ? Color.appSuccess : Color.appError)
                                    .frame(minWidth: 40, alignment: .trailing)
                            }
                        }
                        Divider().background(Color.appBorder)
                        HStack {
                            Text(optimal.constructor.name + " (Constructor)")
                                .font(.caption).foregroundStyle(Color(hex: "6692ff"))
                            Spacer()
                            Text("$\(optimal.constructor.price, specifier: "%.1f")M")
                                .font(.caption2).foregroundStyle(.appTextDim)
                            Text("\(optimal.constructor.points) pts")
                                .font(.caption).fontWeight(.semibold)
                                .foregroundStyle(optimal.constructor.points >= 0 ? Color.appSuccess : Color.appError)
                                .frame(minWidth: 40, alignment: .trailing)
                        }
                    }
                    .padding(.top, 4)
                }
            }
        }
        .cardStyle()
    }
}

struct StatCard: View {
    let title: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title2).fontWeight(.bold).foregroundStyle(.appTextPrimary)
            Text(title)
                .font(.caption2).foregroundStyle(.appTextDim)
        }
        .frame(maxWidth: .infinity)
        .cardStyle()
    }
}