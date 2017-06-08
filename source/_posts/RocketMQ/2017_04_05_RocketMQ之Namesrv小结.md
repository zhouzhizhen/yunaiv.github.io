title: RocketMQ 之 Namesrv 小结
date: 2017-04-05
tags:
categories: RocketMQ
permalink: RocketMQ/namesrv-intro

-------

>  原文地址：[http://www.yunai.me/RocketMQ/namesrv-intro/](http://www.yunai.me/RocketMQ/namesrv-intro/)  
> `RocketMQ` **带注释源码**地址 ：[https://github.com/YunaiV/incubator-rocketmq](https://github.com/YunaiV/incubator-rocketmq)  
> **😈本系列每 1-2 周更新一篇，欢迎订阅、关注、收藏 公众号**  

![wechat_mp](http://www.yunai.me/images/common/wechat_mp.jpeg)

-------

## Namesrv组件

* KVConfigManager：KV配置管理
   * key-value配置管理，增删改查
* RouteInfoManager：路由信息管理
   * 注册Broker，提供Broker信息（名字、角色编号、地址、集群名）
   * 注册Topic，提供Topic信息（Topic名、读写权限、队列情况）

