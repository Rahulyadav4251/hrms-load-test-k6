FROM grafana/k6:latest

# Set working directory
WORKDIR /k6

# Copy startup script into image
COPY scripts/startup.sh /startup.sh

# Use startup script as entrypoint
ENTRYPOINT ["/bin/sh", "/startup.sh"]
