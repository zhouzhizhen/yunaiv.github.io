title: Elastic-Job-Cloud 源码分析 —— 作业调度（二）【编辑中】
date: 2017-12-28
tags:
categories: Elastic-Job-Cloud
permalink: Elastic-Job/cloud-job-scheduler-and-executor-second

-------

**本文基于 Elastic-Job V2.1.5 版本分享**

- [1. 概述](#)
- [2. 作业执行类型](#)
- [3. Producer 发布任务](#)
	- [3.1 常驻作业](#)
	- [3.2 瞬时作业](#)
		- [3.2.1 TransientProducerScheduler](#)
		- [3.2.2 注册瞬时作业](#)
		- [3.2.3 ProducerJob](#)
	- [3.3 小结](#)
- [4. TaskLaunchScheduledService 提交任务](#)
	- [4.1 创建 Fenzo 任务请求](#)
	- [4.2 AppConstraintEvaluator](#)
	- [4.3 将任务请求分配到 Mesos Offer](#)
	- [4.4 创建 Mesos 任务信息](#)
		- [4.4.1 创建单个 Mesos 任务信息](#)
	- [4.5 将任务运行时上下文放入运行时队列](#)
	- [4.6 从队列中删除已运行的作业](#)
	- [4.7 提交任务给 Mesos](#)
- [5. TaskExecutor 执行任务](#)
	- [5.1 TaskThread](#)
	- [5.2 DaemonTaskScheduler](#)
- [6. SchedulerEngine 处理任务的状态变更](#)
- [666. 彩蛋](#)

-------

![](http://www.yunai.me/images/common/wechat_mp_2017_07_31.jpg)

> 🙂🙂🙂关注**微信公众号：【芋道源码】**有福利：  
> 1. RocketMQ / MyCAT / Sharding-JDBC **所有**源码分析文章列表  
> 2. RocketMQ / MyCAT / Sharding-JDBC **中文注释源码 GitHub 地址**  
> 3. 您对于源码的疑问每条留言**都**将得到**认真**回复。**甚至不知道如何读源码也可以请教噢**。  
> 4. **新的**源码解析文章**实时**收到通知。**每周更新一篇左右**。  
> 5. **认真的**源码交流微信群。

-------

