# 广告收入日报

线上地址：https://yingki7.github.io/ad-revenue-dashboard/

## 手动更新数据

1. 在 TradPlus 综合报表导出 CSV，日期范围建议至少 60 天，按“日期”分组。
2. 进入仓库的 `upload` 文件夹，选择 **Add file → Upload files**。
3. 上传并保持文件名为 `report.csv`；也支持 `report.json`。首次可下载 `report-template.csv` 作为模板。
4. 提交到 `main`。GitHub Actions 会自动生成 `data.json` 并发布网页，通常 1–2 分钟完成。

CSV 至少需要日期和收入两列。支持常见列名：

```csv
date,revenue,dau,ecpm
2026-08-28,50707.24,6387713,0.753
2026-08-29,53874.30,6622979,0.745
```

也支持中文表头 `日期,收入,DAU,eCPM`，以及 TradPlus JSON 的 `{ "items": [...] }` 格式。相同日期的多行会自动汇总。

> 不要上传 API Key、账号密码或其他凭据。上传文件会保存在公开仓库中。
