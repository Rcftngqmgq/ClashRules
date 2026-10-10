const config = JSON.parse($content ?? $files[0]);

const response = await $substore.http.get({
  url: "https://gh-proxy.com/https://raw.githubusercontent.com/HXinTeam/VPNGateSub/main/output/singbox.json",
  timeout: 20000
});

const status = response.statusCode ?? response.status;

if (Number(status) !== 200) {
  throw new Error("VPNGate 下载失败：HTTP " + status);
}

const text = String(response.body ?? "")
  .replace(/^\uFEFF/, "")
  .split("\n")
  .filter(line => !line.trimStart().startsWith("//"))
  .join("\n");

const source = JSON.parse(text);

const outbounds = config.outbounds || [];
const group = outbounds.find(item => item.tag === "VPNGate");

if (!group || group.type !== "selector") {
  throw new Error("主配置缺少 VPNGate selector 分组");
}

if (!outbounds.some(item => item.tag === "自建节点")) {
  throw new Error("主配置缺少自建节点出站");
}

const nodes = (source.endpoints || [])
  .filter(node => node.type === "openvpn-client")
  .map(node => ({
    ...node,
    tag: "[VPNGate] " + node.tag,
    detour: "自建节点"
  }));

if (!nodes.length) {
  throw new Error("VPNGate 来源没有 OpenVPN 节点");
}

const tags = new Set([
  ...outbounds.map(item => item.tag),
  ...(config.endpoints || []).map(item => item.tag)
]);

for (const node of nodes) {
  if (tags.has(node.tag)) {
    throw new Error("节点名称重复：" + node.tag);
  }
  tags.add(node.tag);
}

config.endpoints = [...(config.endpoints || []), ...nodes];
group.outbounds = nodes.map(node => node.tag);

const regions = [
  { groups: ["美国手动", "美国自动"], pattern: /🇺🇸|\bUS\b|美国|United States/i },
  { groups: ["香港手动", "香港自动"], pattern: /🇭🇰|\bHK\b|香港|Hong Kong/i },
  { groups: ["狮城手动", "狮城自动"], pattern: /🇸🇬|\bSG\b|新加坡|狮城|Singapore/i },
  { groups: ["日本手动", "日本自动"], pattern: /🇯🇵|\bJP\b|日本|Japan/i },
  { groups: ["韩国手动", "韩国自动"], pattern: /🇰🇷|\bKR\b|韩国|韓國|Korea/i },
  { groups: ["台湾手动", "台湾自动"], pattern: /🇹🇼|\bTW\b|台湾|臺灣|台灣|Taiwan/i }
];

for (const region of regions) {
  const matched = nodes
    .filter(node => region.pattern.test(node.tag))
    .map(node => node.tag);

  for (const name of region.groups) {
    const target = outbounds.find(item => item.tag === name);

    if (target && ["selector", "urltest"].includes(target.type)) {
      target.outbounds = [...new Set([
        ...(target.outbounds || []),
        ...matched
      ])];
    }
  }
}

for (const name of ["手动选择", "自动选择"]) {
  const target = outbounds.find(item => item.tag === name);

  if (target && ["selector", "urltest"].includes(target.type)) {
    target.outbounds = [...new Set([
      ...(target.outbounds || []),
      ...nodes.map(node => node.tag)
    ])];
  }
}

$content = JSON.stringify(config, null, 2);
