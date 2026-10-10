ARG BASE_IMAGE
FROM ${BASE_IMAGE}
WORKDIR /app
RUN mkdir -p /app/data /app/logs && chown -R 10001:10001 /app
COPY --chown=10001:10001 app.jar Healthcheck.class /app/
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=6s --start-period=90s --retries=5 CMD ["java", "-cp", "/app", "Healthcheck"]
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
