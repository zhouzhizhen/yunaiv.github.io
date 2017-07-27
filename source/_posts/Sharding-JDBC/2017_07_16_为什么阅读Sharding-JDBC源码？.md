title: 为什么阅读 Sharding-JDBC 源码？
date: 2017-07-16
tags:
categories: Sharding-JDBC
permalink: Sharding-JDBC/why-read-Sharding-JDBC-source-code

-------

![](http://www.yunai.me/images/common/wechat_mp.jpeg)

> 🙂🙂🙂关注**微信公众号：【芋艿的后端小屋】**有福利：  
> 1. RocketMQ / MyCAT / Sharding-JDBC **所有**源码分析文章列表  
> 2. RocketMQ / MyCAT / Sharding-JDBC **中文注释源码 GitHub 地址**  
> 3. 您对于源码的疑问每条留言**都**将得到**认真**回复。**甚至不知道如何读源码也可以请教噢**。  
> 4. **新的**源码解析文章**实时**收到通知。**每周更新一篇左右**。
> 5. **认真的**源码交流微信群。

-------


## 为什么阅读 Sharding-JDBC 源码？

1. 看完大部分的 MyCAT 源码，有惊喜的地方，也有失望的地方，因而想看看 Sharding-JDBC 进行下对比。尽管，Sharding-JDBC 是 Client 端级别，MyCAT 是 Server 级别。
2. Sharding-JDBC 经历过当当本身业务的考验，从可靠性上来说会更让人有信赖感。
3. 文档更加完善，开发体系更加健全。
4. Sharding-JDBC 1.5.0.M3 发布。
5. **最大努力送达型**事务支持，想要进一步了解分布式事务的解决方案。Last But Very Importment。

## 步骤

* FROM MyCAT

    **从 MyCAT 阅读计划复制，用于对比。**

* [ ] ~~NIO~~
* [ ] ~~分布式事务~~
* [ ] ~~MyCAT 主从~~
* [ ] ~~支持prepare预编译指令~~
* [ ] 自增序列
* [ ] 单库任意 Join
* [ ] 跨库2表 Join
* [ ] ~~跨库多表 Join~~
* [ ] SQL 解析
* [ ] 读写分离
* [ ] MySQL 主从
* [ ] ~~自动故障切换~~
* [ ] ~~Galera Cluster 集群~~
* [ ] ~~MHA 集群~~
* [ ] ~~Percona 集群~~
* [ ] ~~服务降级~~
* [ ] ~~多租户~~
* [ ] 路由
* [ ] ~~MyCAT 集群~~
* [ ] 注解
* [ ] ~~缓存~~
* [ ] 监控
* [ ] ~~Mongodb~~
* [ ] 内存管理
* [ ] 数据聚合
* [ ] 数据排序
* [ ] 分表
* [ ] 分库
* [ ] 全局表
* [ ] ~~E/R关系~~
* [ ] 服务降级
* [ ] SQL 注入攻击拦截
* [ ] ~~MySQL 协议~~
* [ ] ~~PostgreSQL 协议~~
* [ ] 存储过程

* FROM Sharding-JDBC

    **从 官网 介绍获取。**
    
* [ ] 分布式事务 ：最大努力送达型事务
* [ ] 分布式事务 ：TCC型事务(TBD)
