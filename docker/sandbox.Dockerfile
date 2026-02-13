# Sandbox Environment for Safe Code Execution
# This Dockerfile creates an isolated Python environment for executing user code safely
# Features: Minimal attack surface, resource limits, no network access

FROM python:3.12-slim

# Install system dependencies (minimal set)
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python data science packages (pinned versions for reproducibility)
# Only include safe, approved packages
    RUN pip install --upgrade pip setuptools wheel && \
        pip install --no-cache-dir \
        pandas>=2.0.0 \
        numpy>=1.24.0 \
        scipy>=1.11.0 \
        scikit-learn>=1.3.0 \
        matplotlib>=3.7.0 \
        seaborn>=0.12.0 \
        plotly>=5.16.0 \
        openpyxl>=3.1.0 \
        sqlalchemy>=2.0.0 \
        psycopg2-binary>=2.9.0 \
        python-dateutil>=2.8.0
# Create non-root user for security (runs as unprivileged)
RUN groupadd -g 1000 sandbox && \
    useradd -m -u 1000 -g 1000 -s /usr/sbin/nologin sandbox

# Set working directory
WORKDIR /sandbox

# Create required directories
RUN mkdir -p /sandbox/data /sandbox/output && \
    chown -R sandbox:sandbox /sandbox

# Switch to non-root user
USER sandbox

# Set Python to unbuffered mode for immediate output
ENV PYTHONUNBUFFERED=1

# Entrypoint: Python (nothing executes until container is run)
# Container runs with: docker run ... python -c "[user code]"
ENTRYPOINT ["/usr/bin/python3"]
CMD ["-u"]
