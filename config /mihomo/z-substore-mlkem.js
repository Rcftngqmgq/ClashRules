// 为 VLESS + REALITY 补充 X25519MLKEM768 参数，不覆盖已有值
function operator(proxies) {
  for (const p of proxies) {

    // 只匹配 VLESS + REALITY 节点
    if (
      p.type === 'vless' &&
      p['reality-opts'] &&
      typeof p['reality-opts'] === 'object' &&
      !('support-x25519mlkem768' in p['reality-opts'])
    ) {

      // 仅在参数不存在时添加，不覆盖已有值
      p['reality-opts']['support-x25519mlkem768'] = true;
    }
  }

  return proxies;
}
