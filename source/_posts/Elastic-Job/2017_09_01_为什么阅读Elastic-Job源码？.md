title: Elastic-Job 源码分析 —— 为什么阅读 Elastic-Job 源码？
date: 2017-09-01
tags:
categories: Elastic-Job
permalink: Elastic-Job/why-read-Elastic-Job-source-code

-------

![](http://www.yunai.me/images/common/wechat_mp_2017_07_31.jpg)

> 🙂🙂🙂关注**微信公众号：【芋艿的后端小屋】**有福利：  
> 1. RocketMQ / MyCAT / Sharding-JDBC **所有**源码分析文章列表  
> 2. RocketMQ / MyCAT / Sharding-JDBC **中文注释源码 GitHub 地址**  
> 3. 您对于源码的疑问每条留言**都**将得到**认真**回复。**甚至不知道如何读源码也可以请教噢**。  
> 4. **新的**源码解析文章**实时**收到通知。**每周更新一篇左右**。  
> 5. **认真的**源码交流微信群。

-------


## 为什么阅读 Elastic-Job 源码？

1. 之前断断续续读过 Quartz 源码，团队里也对 Quartz 做过一些封装管理，很多 Quartz 二次封装开源项目，想了解 Elastic-Job 做了哪些功能，是怎么实现的
2. Quartz 多节点通过数据库锁实现任务抢占，Elastic-Job 基于什么策略实现任务调度与分配
3. 任务分片如何实现
4. Elastic-Job-Cloud 如何实现任务动态扩容和缩容
5. 任务超时如何处理？任务假死怎么判断？

## 使用公司

## 步骤/功能

* [ ] 分布式调度协调
* [ ] 弹性扩容缩容
* [ ] 失效转移
* [ ] 错过执行作业重触发
* [ ] 作业分片策略
* [ ] 作业唯一节点执行
* [ ] 自诊断并修复分布式不稳定造成的问题
* [ ] 支持并行调度
* [ ] 支持作业生命周期操作
* [ ] 丰富的作业类型
* [ ] Spring整合以及命名空间提供
* [ ] 运维平台
* [ ] 事件追踪
* [ ] DUMP 作业运行信息
* [ ] 作业监听器
* [ ] 基于 Docker 的进程隔离（TBD）
* [ ] 高可用


