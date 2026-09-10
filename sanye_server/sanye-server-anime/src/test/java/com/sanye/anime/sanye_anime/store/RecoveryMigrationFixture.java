package com.sanye.anime.sanye_anime.store;

import org.flywaydb.core.Flyway;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.List;

/** Creates only a fresh, explicitly named recovery fixture with real Flyway history. */
public final class RecoveryMigrationFixture {
    public static void main(String[] args) throws Exception {
        String url = System.getenv("SANYE_RECOVERY_DB_URL");
        String user = System.getenv("SANYE_RECOVERY_DB_USER");
        String password = System.getenv("SANYE_RECOVERY_DB_PASSWORD");
        if (url == null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:[0-9]{4,5}/sanye_source_business")
                || user == null || password == null || args.length != 1) {
            throw new IllegalArgumentException("An isolated recovery source and repository root are required");
        }
        try (var connection = DriverManager.getConnection(url, user, password);
             var statement = connection.createStatement();
             var rows = statement.executeQuery("select count(*) from information_schema.schemata where schema_name like 'sanye\\_%' escape '\\'")) {
            rows.next();
            if (rows.getInt(1) != 0) throw new IllegalStateException("Recovery fixture requires a fresh database");
        }
        for (String module : List.of("ai-chat", "anime", "auth", "favorite", "feedback", "file", "job", "search")) {
            Path migrations = Path.of(args[0], "sanye_server", "sanye-server-" + module, "src/main/resources/db/migration").toAbsolutePath();
            if (!Files.isDirectory(migrations)) throw new IllegalArgumentException("Missing migration directory");
            var flyway = Flyway.configure().dataSource(url, user, password)
                    .schemas("sanye_" + module.replace('-', '_')).locations("filesystem:" + migrations)
                    .cleanDisabled(true).load();
            flyway.migrate();
            flyway.validate();
            if (flyway.migrate().migrationsExecuted != 0) throw new IllegalStateException("Repeated migration changed schema");
        }
        System.out.println("RECOVERY_FLYWAY_VALIDATED=8");
    }
}
