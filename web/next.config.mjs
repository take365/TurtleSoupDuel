
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Avoid bundling cassandra-driver; load it at runtime on server.
    serverComponentsExternalPackages: ['cassandra-driver'],
  },
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config, { isServer }) => {
    // Ignore optional native deps pulled by cassandra-driver (e.g., kerberos)
    config.resolve = config.resolve || {};
    config.resolve.alias = { ...(config.resolve.alias || {}), kerberos: false };
    return config;
  },
};

export default nextConfig;
