import { OutdoorEnvironment } from '../graphics/OutdoorEnvironment.js';
import { publicAssetUrl } from '../config/publicAssetUrl.js';

const V18_CYBER_ALIAS = '/hdri/cyber-night-shanghai-bund-1k.hdr';
const LOCAL_CYBER_HDR = publicAssetUrl('hdri/shanghai_bund_1k.hdr');

export function installCyberEnvironmentRedirect() {
  const proto = OutdoorEnvironment.prototype;
  if (proto.__halfpipeV18CyberRedirectPatched) return false;
  proto.__halfpipeV18CyberRedirectPatched = true;
  const originalSetUrl = proto.setUrl;
  proto.setUrl = function setUrlV18(url = null) {
    return originalSetUrl.call(
      this,
      url === V18_CYBER_ALIAS ? LOCAL_CYBER_HDR : url,
    );
  };
  return true;
}