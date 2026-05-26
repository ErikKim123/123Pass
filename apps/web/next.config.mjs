/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@123pass/ui', '@123pass/vault-sdk', '@123pass/core-crypto', '@123pass/shared'],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
