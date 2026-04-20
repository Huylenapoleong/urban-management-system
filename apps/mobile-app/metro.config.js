const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver || {};
config.resolver.alias = {
  ...(config.resolver.alias || {}),
  '@react-native-async-storage/async-storage': path.resolve(
    __dirname,
    'src/lib/async-storage-shim.ts',
  ),
};

module.exports = config;
