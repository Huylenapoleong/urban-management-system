const fs = require('fs');
const path = require('path');

const baseDir = path.resolve('d:/CNM/urban-management-system/apps/mobile-app/node_modules/react-native-webrtc');

const filesToPatch = [
  'lib/commonjs/RTCView.js',
  'lib/module/RTCView.js',
  'lib/commonjs/ScreenCapturePickerView.js',
  'lib/module/ScreenCapturePickerView.js'
];

for (const file of filesToPatch) {
  const fullPath = path.join(baseDir, file);
  if (!fs.existsSync(fullPath)) {
    console.log('Not found:', fullPath);
    continue;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Patch for CommonJS files
  content = content.replace(
    /var _default = \(0, _reactNative\.requireNativeComponent\)/g,
    "var rNC = require('react-native/Libraries/ReactNative/requireNativeComponent').default || _reactNative.requireNativeComponent;\nvar _default = (0, rNC)"
  );
  
  // Patch for ESModule files
  content = content.replace(
    /import { requireNativeComponent } from 'react-native';/g,
    "import requireNativeComponentImport from 'react-native/Libraries/ReactNative/requireNativeComponent';\nconst requireNativeComponent = requireNativeComponentImport.default || requireNativeComponentImport;"
  );
  
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log('Patched:', file);
}
