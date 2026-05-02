import Foundation
import Observation

// Model for the driver-form endpoint response
private struct DriverFormResponse: Decodable {
    let prices: [String: [DriverWeekPrice]]
}
private struct DriverWeekPrice: Decodable {
    let week: Int
    let price: Double
}

@Observable
final class StatsViewModel {
    var stats: StatsResponse?
    var driverForm: [DriverPriceEntry] = []
    var constructorForm: [ConstructorPriceEntry] = []
    var isLoading = false
    var errorMessage: String?
    var activeTab: StatsTab = .performance
    var optimalTeam: OptimalTeamResponse?
    var isLoadingOptimal = false
    var hindsightExpanded = false

    enum StatsTab { case performance, prices }

    func load(leagueId: String, week: Int) async {
        isLoading = true
        async let statsResult: StatsResponse = APIClient.shared.request(
            "GET", path: "/api/leagues/\(leagueId)/stats"
        )
        async let pricesResult: PricesResponse = APIClient.shared.request(
            "GET", path: "/api/leagues/\(leagueId)/prices/\(week)"
        )
        async let formResult: DriverFormResponse? = {
            try? await APIClient.shared.request(
                "GET", path: "/api/leagues/\(leagueId)/driver-form/\(week)"
            ) as DriverFormResponse
        }()

        do {
            stats = try await statsResult
            var prices = try await pricesResult
            let form = await formResult

            // Merge price history from driver-form endpoint into driver entries
            if let priceMap = form?.prices {
                driverForm = prices.drivers.map { entry in
                    var e = entry
                    if let history = priceMap[entry.driverId] {
                        e.priceHistory = history.sorted { $0.week < $1.week }.map { $0.price }
                    }
                    return e
                }
            } else {
                driverForm = prices.drivers
            }
            constructorForm = prices.constructors
        } catch let e as APIError { errorMessage = e.errorDescription }
        catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    func fetchOptimalTeam(leagueId: String, week: Int) async {
        isLoadingOptimal = true
        hindsightExpanded = false
        optimalTeam = nil
        do {
            optimalTeam = try await APIClient.shared.request(
                "GET", path: "/api/leagues/\(leagueId)/optimal-team/\(week)"
            ) as OptimalTeamResponse
        } catch {
            // 404 means no results yet — silently ignore
        }
        isLoadingOptimal = false
    }
}