import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Volunteer pages were consolidated into /projects; keep old links working.
  async redirects() {
    return [
      { source: "/login", destination: "/", permanent: false },
      { source: "/signup", destination: "/", permanent: false },
      { source: "/volunteer/dashboard", destination: "/volunteer/projects", permanent: false },
      { source: "/volunteer/discover", destination: "/projects", permanent: false },
      { source: "/volunteer/discover/jobs/:id", destination: "/projects/:id", permanent: false },
      { source: "/dashboard", destination: "/nonprofit/dashboard", permanent: false },
    ];
  },
};

export default nextConfig;
