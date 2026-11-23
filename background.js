// Meko's BiliVRCParser - 后台服务
// 说明：解析逻辑已全部移到 content.js（页面上下文）执行。
// 后台仅负责点击扩展图标时打开设置页。

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
