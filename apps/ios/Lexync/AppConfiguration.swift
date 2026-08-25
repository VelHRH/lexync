import Foundation
import Supabase

enum AppConfiguration {
    static func supabaseClient(disableNetwork: Bool) throws -> SupabaseClient {
        let environment = ProcessInfo.processInfo.environment
        let urlValue = environment["LEXYNC_SUPABASE_URL"]
            ?? Bundle.main.object(forInfoDictionaryKey: "LexyncSupabaseURL") as? String
        let publishableKey = environment["LEXYNC_SUPABASE_PUBLISHABLE_KEY"]
            ?? Bundle.main.object(forInfoDictionaryKey: "LexyncSupabasePublishableKey") as? String

        guard let urlValue, let url = URL(string: urlValue), !urlValue.isEmpty else {
            throw ConfigurationError.missingURL
        }
        guard let publishableKey, !publishableKey.isEmpty else {
            throw ConfigurationError.missingPublishableKey
        }

        guard disableNetwork else {
            return SupabaseClient(supabaseURL: url, supabaseKey: publishableKey)
        }

        let sessionConfiguration = URLSessionConfiguration.ephemeral
        sessionConfiguration.protocolClasses = [OfflineURLProtocol.self]
        return SupabaseClient(
            supabaseURL: url,
            supabaseKey: publishableKey,
            options: SupabaseClientOptions(
                global: .init(session: URLSession(configuration: sessionConfiguration))
            )
        )
    }
}

private final class OfflineURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
    }

    override func stopLoading() {}
}

enum ConfigurationError: LocalizedError {
    case missingURL
    case missingPublishableKey

    var errorDescription: String? {
        switch self {
        case .missingURL:
            "Set LEXYNC_SUPABASE_URL before running Lexync."
        case .missingPublishableKey:
            "Set LEXYNC_SUPABASE_PUBLISHABLE_KEY before running Lexync."
        }
    }
}
