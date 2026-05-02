import Foundation

struct LeaderboardResponse: Decodable {
    let standings: [LeaderboardEntry]
    let latestRound: Int?
}

struct LeaderboardEntry: Decodable, Identifiable {
    let userId: String
    var id: String { userId }
    let userName: String
    let teamName: String?
    let avatarColor: String?
    let totalPoints: Int
    let totalWins: Int
    var rank: Int
    var rankDelta: Int?
    let roundPoints: [String: Int]?
}

struct WeeklyLeaderboardResponse: Decodable {
    let week: Int
    let standings: [WeeklyLeaderboardEntry]
}

struct WeeklyLeaderboardEntry: Decodable, Identifiable {
    let userId: String
    var id: String { userId }
    let userName: String
    let avatarColor: String?
    var points: Int
    var rank: Int
    let captainId: String?
    let chipUsed: String?
}

struct OptimalTeamResponse: Decodable {
    let week: Int
    let totalPoints: Int
    let budget: Double
    let drivers: [OptimalDriver]
    let constructor: OptimalConstructor

    struct OptimalDriver: Decodable, Identifiable {
        let id: String
        let name: String
        let abbr: String?
        let points: Int
        let price: Double
    }

    struct OptimalConstructor: Decodable {
        let id: String
        let name: String
        let points: Int
        let price: Double
    }
}

struct StatsResponse: Decodable {
    let leagueId: String
    let userId: String
    let totalPoints: Int
    let roundsPlayed: Int
    let avgPoints: Int
    let bestRound: RoundStat?
    let worstRound: RoundStat?
    let rounds: [RoundStat]
}

struct RoundStat: Decodable, Identifiable {
    let week: Int
    var id: Int { week }
    let points: Int
    let cumulative: Int
    let captainName: String?
    let chipUsed: String?
    let budgetUsed: Double?
}