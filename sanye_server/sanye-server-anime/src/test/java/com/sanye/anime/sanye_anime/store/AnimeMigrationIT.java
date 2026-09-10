package com.sanye.anime.sanye_anime.store;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimeEpisode;
import com.sanye.anime.sanye_anime.AnimeMemoryStore.AnimePlaybackOption;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

/** Explicit isolated PostgreSQL acceptance; never targets application databases. */
class AnimeMigrationIT {
    private DriverManagerDataSource dataSource(String suffix) {
        String port = System.getenv("SANYE_MIGRATION_TEST_PORT");
        if (port == null || !port.matches("[0-9]{4,5}")) {
            throw new IllegalStateException("Set SANYE_MIGRATION_TEST_PORT for a fresh isolated PostgreSQL cluster");
        }
        return new DriverManagerDataSource("jdbc:postgresql://127.0.0.1:" + port
                + "/sanye_tr01_" + suffix, "sanye_tr01", "");
    }

    private Flyway migrate(DriverManagerDataSource dataSource, String target) {
        Flyway flyway = Flyway.configure().dataSource(dataSource).schemas("sanye_anime")
                .locations("classpath:db/migration").target(target).cleanDisabled(true).load();
        flyway.migrate();
        flyway.validate();
        return flyway;
    }

    private void requireFresh(DriverManagerDataSource dataSource) {
        assertFalse(Boolean.TRUE.equals(new JdbcTemplate(dataSource).queryForObject(
                "select exists(select 1 from information_schema.schemata where schema_name='sanye_anime')",
                Boolean.class)), "Use a fresh isolated database; existing schemas must not be altered");
    }

    @Test
    void cleanInstallAndPlaybackOptionsRoundTrip() {
        var dataSource = dataSource("fresh");
        requireFresh(dataSource);
        var flyway = migrate(dataSource, "10");
        assertEquals("10", flyway.info().current().getVersion().toString());
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        // V7 removes the old demonstration catalog; fresh installs need separately supplied content.
        assertEquals(0, jdbc.queryForObject("select count(*) from sanye_anime.sanye_anime", Integer.class));
        jdbc.update("insert into sanye_anime.sanye_anime(id,title,type) values(1,'fixture','test')");
        var options = List.of(new AnimePlaybackOption("https://example.test/main", "text/html", "main"),
                new AnimePlaybackOption("https://example.test/backup", "text/html", "backup"));
        var store = new JdbcAnimeMediaStore(jdbc, new ObjectMapper(), "sanye_anime");
        store.replaceEpisodes(1, List.of(new AnimeEpisode(0, 1, "fixture", "https://example.test/source",
                options.get(0).url(), "text/html", "fixture", options)));
        assertEquals(options, store.episodesOf(1).getFirst().playbackOptions());
        store.replaceEpisodes(1, List.of());
        assertEquals(List.of(), store.episodesOf(1));
        assertEquals(0, flyway.migrate().migrationsExecuted);
    }

    @Test
    void upgradePreservesLegacyEpisodeAndDefaultsOptions() {
        var dataSource = dataSource("upgrade");
        requireFresh(dataSource);
        migrate(dataSource, "9");
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.update("insert into sanye_anime.sanye_anime(id,title,type) values(1,'fixture','test')");
        jdbc.update("insert into sanye_anime.sanye_anime_episode(anime_id,episode_no,title,source_page_url,playback_url)"
                + " values(1,1,'fixture','https://example.test/source','https://example.test/main')");
        migrate(dataSource, "10");
        var episode = new JdbcAnimeMediaStore(jdbc, new ObjectMapper(), "sanye_anime").episodesOf(1).getFirst();
        assertEquals("https://example.test/main", episode.playbackUrl());
        assertEquals(List.of(), episode.playbackOptions());
    }
}
