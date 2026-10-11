async function operator(proxies = []) {
  const LIMIT = 10;       // 每个国家最多保留 10 个
  const TIMEOUT = 2000;   // TCP 连接超时，毫秒
  const CONCURRENCY = 10; // 同时测试数量

  const mod = require("net");
  const net = typeof mod === "string" ? eval(mod) : mod;

  if (!net || !net.Socket) {
    throw new Error("当前后端无法加载 Node.js net 模块");
  }

  const groups = new Map();
  let index = 0;
  let eligible = 0;

  function measure(p) {
    return new Promise(resolve => {
      const socket = new net.Socket();
      const start = Date.now();
      let done = false;

      const finish = latency => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(latency);
      };

      const timer = setTimeout(
        () => finish(Infinity),
        TIMEOUT
      );

      socket.once("connect", () => finish(Date.now() - start));
      socket.once("error", () => finish(Infinity));
      socket.once("close", () => finish(Infinity));

      try {
        socket.connect({
          host: String(p.server).replace(/^\[|\]$/g, ""),
          port: Number(p.port)
        });
      } catch (_) {
        finish(Infinity);
      }
    });
  }

  async function worker() {
    while (index < proxies.length) {
      const order = index++;
      const p = proxies[order];
      const type = String(p.type || "").toLowerCase();
      const isHY2 = ["hysteria2", "hy2"].includes(type);

      // 其他纯 UDP 协议跳过，HY2 直接包含
      if (["hysteria", "tuic", "wireguard", "masque", "juicity"]
          .includes(type)) continue;

      if (type === "openvpn" &&
          /^udp/i.test(String(p.proto || p.protocol || ""))) {
        continue;
      }

      const port = Number(p.port);
      if (!p.server || !Number.isInteger(port) ||
          port < 1 || port > 65535) continue;

      // 根据节点名称识别国家
      const country = ProxyUtils.getISO(p.name || "");
      if (!country || !/^[a-z]{2}$/i.test(country)) continue;

      eligible++;
      const key = country.toUpperCase();

      // HY2 不做 TCP 测试，用于补位
      const latency = isHY2 ? Infinity : await measure(p);
      if (!isHY2 && !Number.isFinite(latency)) continue;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({
        proxy: p,
        latency,
        order,
        isHY2
      });
    }
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker())
  );

  if (proxies.length && !eligible) {
    throw new Error(
      "没有适合筛选的节点，请检查协议、地址端口和节点国家名称"
    );
  }

  const result = [];

  for (const [country, nodes] of groups) {
    nodes.sort((a, b) => {
      // 已测通的 TCP 节点优先，HY2 放在后面
      if (a.isHY2 !== b.isHY2) return a.isHY2 ? 1 : -1;
      if (a.isHY2) return a.order - b.order;
      return a.latency - b.latency || a.order - b.order;
    });

    const selected = nodes.slice(0, LIMIT);
    result.push(...selected.map(n => n.proxy));

    const hy2Count = selected.filter(n => n.isHY2).length;
    $substore.info(
      `${country}：保留 ${selected.length} 个，其中 HY2 ${hy2Count} 个`
    );
  }

  return result;
}
