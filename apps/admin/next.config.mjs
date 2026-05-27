/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@123pass/vault-sdk', '@123pass/shared'],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
