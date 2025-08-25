/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure Node.js runtime (avoid Edge by default)
  experimental: {
    // No special flags needed; routes can declare runtime individually.
  },
  typescript: {
    // Allow build to proceed even if type errors exist (initial scaffolding)
    ignoreBuildErrors: false
  },
  eslint: {
    ignoreDuringBuilds: true
  }
};

export default nextConfig;

