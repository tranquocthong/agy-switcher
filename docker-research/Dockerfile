FROM debian:bookworm-slim

# Install dependencies needed by agy install script
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    bash \
    procps \
    file \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user (similar to real user environment)
RUN useradd -m -s /bin/bash researcher
USER researcher
WORKDIR /home/researcher

# Install agy
RUN curl -fsSL https://antigravity.google/cli/install.sh | bash || true

# Add agy to PATH
ENV PATH="/home/researcher/.local/bin:$PATH"

# Default: drop into bash for interactive exploration
CMD ["/bin/bash"]
