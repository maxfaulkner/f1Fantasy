import Foundation

// MARK: - Errors

enum APIError: LocalizedError {
    case unauthorized
    case notFound
    case serverError(String)
    case decodingError(Error)
    case networkError(Error)
    case unknown

    var errorDescription: String? {
        switch self {
        case .unauthorized:          return "Session expired. Please sign in again."
        case .notFound:              return "Not found."
        case .serverError(let msg):  return msg
        case .decodingError(let e):  return "Data error: \(e.localizedDescription)"
        case .networkError(let e):   return e.localizedDescription
        case .unknown:               return "An unknown error occurred."
        }
    }
}

private struct APIErrorResponse: Decodable { let error: String }

// MARK: - Client

final class APIClient {
    static let shared = APIClient()
    private let baseURL = URL(string: "https://f1fantasyapp.up.railway.app")!

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom { decoder in
            let string = try decoder.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: string) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: string) { return date }
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Invalid date: \(string)")
            )
        }
        return d
    }()

    private init() {}

    func request<T: Decodable>(
        _ method: String,
        path: String,
        body: (any Encodable)? = nil,
        queryItems: [URLQueryItem]? = nil
    ) async throws -> T {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if let queryItems { components.queryItems = queryItems }

        var req = URLRequest(url: components.url!)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = KeychainHelper.shared.loadToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.httpBody = try JSONEncoder().encode(body)
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw APIError.networkError(error)
        }

        guard let http = response as? HTTPURLResponse else { throw APIError.unknown }

        if http.statusCode == 401 {
            KeychainHelper.shared.deleteToken()
            throw APIError.unauthorized
        }
        if http.statusCode == 404 { throw APIError.notFound }
        guard (200..<300).contains(http.statusCode) else {
            let msg = (try? decoder.decode(APIErrorResponse.self, from: data))?.error ?? "Request failed (\(http.statusCode))"
            throw APIError.serverError(msg)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
}