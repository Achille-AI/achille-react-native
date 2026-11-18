// The example runs the SDK from ../src, with this app's own React and React
// Native (never the library's dev copies in ../node_modules).
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const root = path.resolve(__dirname, "..");
const config = getDefaultConfig(__dirname);

config.watchFolders = [root];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];
config.resolver.disableHierarchicalLookup = true;
config.resolver.extraNodeModules = { "@achille-ai/react-native": path.join(root, "src") };

module.exports = config;
