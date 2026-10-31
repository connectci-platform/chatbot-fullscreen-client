/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Local development serves the dev server through ddev at this host, so
  // the token request to the local portal is same-site (see the portal's
  // .ddev/nginx_full/chat-proxy.conf).
  allowedDevOrigins: ["chat.accessmatch.ddev.site"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
