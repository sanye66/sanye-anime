package com.sanye.anime.sanye_core.event;

@FunctionalInterface
public interface EventHandler {
    void handle(DomainEvent event) throws Exception;
}
