/**
 * Tailwind CSS configuration for the InternLink Angular project.
 * This file ensures Tailwind scans all component templates and
 * TypeScript files so that used classes are included in the final CSS.
 */
module.exports = {
  content: [
    "./src/**/*.html",
    "./src/**/*.ts",
    // If you use any external libraries that contain Tailwind classes,
    // you can add their paths here as well.
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
