const TerserPlugin = require('terser-webpack-plugin')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
  webpack: (config, { isServer, dev }) => {
    
    // Add rule to handle .mjs files correctly (for ort.webgpu.bundle.min.mjs)
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules/,
      type: 'javascript/auto',
    })
    
    // Configure Terser to handle ES modules (only in production client builds)
    if (!dev && !isServer) {
      config.optimization.minimizer = [
        new TerserPlugin({
          terserOptions: {
            module: true,     // Allow import.meta in ES modules
            ecma: 2020,       // Support modern JS features
            compress: true,
            mangle: true,
          },
          parallel: true,
        }),
      ]
    }
    
    return config
  },
}

module.exports = nextConfig
