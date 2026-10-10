import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class Healthcheck {
    public static void main(String[] args) {
        try {
            var endpoint = System.getenv().getOrDefault("RELEASE_HEALTH_URL", "http://127.0.0.1:8090/actuator/health");
            var request = HttpRequest.newBuilder(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(4)).GET().build();
            var response = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()
                    .send(request, HttpResponse.BodyHandlers.ofString());
            System.exit(response.statusCode() == 200 ? 0 : 1);
        } catch (Exception ignored) {
            System.exit(1);
        }
    }
}
