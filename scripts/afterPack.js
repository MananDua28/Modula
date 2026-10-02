const { execSync } = require('child_process');
const path = require('path');

exports.default = async function(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`[afterPack] Performing deep ad-hoc codesign on ${appPath}...`);
  try {
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
    console.log('[afterPack] Successfully signed app bundle.');
  } catch (err) {
    console.error('[afterPack] Codesign error:', err.message);
  }
};
