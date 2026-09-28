package com.shopflow.support;

import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

/**
 * Base for integration tests: full application context, MockMvc and a real PostgreSQL.
 * <p>
 * The database is {@code TEST_DATABASE_URL} (environment variable or the repository's git-ignored .env) when set,
 * e.g. a local PostgreSQL; otherwise a Testcontainers PostgreSQL is started (CI). The schema is cleaned and
 * migrated once per test JVM.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import({IntegrationTest.CleanMigrate.class, TestApi.class, TestData.class})
public abstract class IntegrationTest {

    private static PostgreSQLContainer container;

    @Autowired
    protected TestApi api;

    @Autowired
    protected TestData data;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        Optional<String> url = setting("TEST_DATABASE_URL");
        if (url.isPresent()) {
            registry.add("spring.datasource.url", url::get);
            setting("TEST_DATABASE_USERNAME").or(() -> setting("DATABASE_USERNAME")).ifPresent(u -> registry.add("spring.datasource.username", () -> u));
            setting("TEST_DATABASE_PASSWORD").or(() -> setting("DATABASE_PASSWORD")).ifPresent(p -> registry.add("spring.datasource.password", () -> p));
            return;
        }
        synchronized (IntegrationTest.class) {
            if (container == null) {
                container = new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"));
                container.start();
            }
        }
        registry.add("spring.datasource.url", container::getJdbcUrl);
        registry.add("spring.datasource.username", container::getUsername);
        registry.add("spring.datasource.password", container::getPassword);
    }

    /** Environment variable first, then the repository .env file (never committed). */
    static Optional<String> setting(String key) {
        String env = System.getenv(key);
        if (env != null && !env.isBlank()) {
            return Optional.of(env);
        }
        for (Path p : List.of(Path.of(".env"), Path.of("../.env"))) {
            if (Files.exists(p)) {
                try {
                    for (String line : Files.readAllLines(p)) {
                        String t = line.trim();
                        if (t.startsWith(key + "=")) {
                            return Optional.of(t.substring(key.length() + 1).trim());
                        }
                    }
                } catch (IOException ignored) {
                    // fall through
                }
            }
        }
        return Optional.empty();
    }

    @TestConfiguration
    static class CleanMigrate {
        @Bean
        FlywayMigrationStrategy cleanMigrate() {
            return (Flyway flyway) -> {
                flyway.clean();
                flyway.migrate();
            };
        }
    }
}
