# Proxy Configuration for Firecrawl

This directory contains documentation for the proxy setup used with Firecrawl.

## Proxy Implementation

Firecrawl uses the dannydirect/tinyproxy Docker image as a lightweight HTTP proxy server.

### Features

- **Simplicity**: Minimal configuration, easy to maintain
- **Anonymization**: No identifying headers sent with requests
- **Performance**: Lightweight proxy with minimal overhead
- **Stability**: Built specifically for containerized environments

## Usage with Firecrawl

Tinyproxy is automatically used by both the API and Playwright services through the environment variables in `.env`:

```
PROXY_SERVER=http://tinyproxy:8888
```

## Monitoring

You can view proxy logs via Docker:

```bash
docker-compose logs tinyproxy
```

## Customization

The dannydirect/tinyproxy implementation uses command-line arguments for configuration:

```yaml
# In docker-compose.yaml
tinyproxy:
  image: dannydirect/tinyproxy:latest
  command: ANY  # Allow connections from any IP
```

You can restrict access to specific IP addresses or CIDR ranges by replacing `ANY` with specific addresses:

```yaml
command: 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16
```

After making changes, restart the container:

```bash
docker-compose restart tinyproxy
```

## Security Considerations

- The current configuration allows connections from any IP within the Docker network
- For production environments, consider restricting to specific CIDR ranges
- This proxy has no authentication mechanism by default
