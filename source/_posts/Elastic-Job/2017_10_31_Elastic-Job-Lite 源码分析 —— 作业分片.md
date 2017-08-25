title: Elastic-Job-Lite 源码分析 —— 作业分片（编辑中）
date: 2017-10-31
tags:
categories: Elastic-Job
permalink: Elastic-Job/job-sharding

-------

**本文基于 Elastic-Job V2.1.5 版本分享**

-------

# 1. 概述

本文主要分享 **Elastic-Job-Lite 作业分片**。

涉及到主要类的类图如下( [打开大图](http://www.yunai.me/images/Elastic-Job/2017_10_31/01.png) )：

![](http://www.yunai.me/images/Elastic-Job/2017_10_31/01.png)

* 粉色的类在 `com.dangdang.ddframe.job.lite.internal.sharding` 包下，实现了 Elastic-Job-Lite 作业分片。
* ShardingService，作业分片服务。

> 你行好事会因为得到赞赏而愉悦  
> 同理，开源项目贡献者会因为 Star 而更加有动力  
> 为 Elastic-Job 点赞！[传送门](https://github.com/dangdangdotcom/elastic-job/stargazers)

# 2. 作业分片条件

当作业满足分片条件时，不会**立即**进行作业分片分配，而是设置需要重新进行分片的**标记**，等到作业分片获取时，判断有该标记后进行分配。

设置需要重新进行分片的**标记**的代码如下：

```Java
// ShardingService.java
/**
* 设置需要重新分片的标记.
*/
public void setReshardingFlag() {
   jobNodeStorage.createJobNodeIfNeeded(ShardingNode.NECESSARY);
}

// JobNodeStorage.java
/**
* 如果存在则创建作业节点.
* 
* <p>如果作业根节点不存在表示作业已经停止, 不再继续创建节点.</p>
* 
* @param node 作业节点名称
*/
public void createJobNodeIfNeeded(final String node) {
   if (isJobRootNodeExisted() && !isJobNodeExisted(node)) {
       regCenter.persist(jobNodePath.getFullPath(node), "");
   }
}
```

* 调用 `#setReshardingFlag()` 方法设置需要重新分片的标记 `/${JOB_NAME}/leader/sharding/necessary`。该 Zookeeper 数据节点是**永久**节点，存储空串( `""` )，使用 zkClient 查看如下：

    ```bash
    [zk: localhost:2181(CONNECTED) 2] ls /elastic-job-example-lite-java/javaSimpleJob/leader/sharding
    [necessary]
    [zk: localhost:2181(CONNECTED) 3] get /elastic-job-example-lite-java/javaSimpleJob/leader/sharding/necessary
    
    ```
* 设置标记之后，通过调用 `#isNeedSharding()` 方法即可判断是否需要重新分片。

    ```Java
    // ShardingService.java
    /**
    * 判断是否需要重分片.
    * 
    * @return 是否需要重分片
    */
    public boolean isNeedSharding() {
       return jobNodeStorage.isJobNodeExisted(ShardingNode.NECESSARY);
    }
    
    // JobNodeStorage.java
    /**
    * 判断作业节点是否存在.
    * 
    * @param node 作业节点名称
    * @return 作业节点是否存在
    */
    public boolean isJobNodeExisted(final String node) {
       return regCenter.isExisted(jobNodePath.getFullPath(node));
    }
    ```

**设置需要重新进行分片有 4 种情况**

**第一种**，注册作业启动信息时。

```Java
// SchedulerFacade.java
public void registerStartUpInfo(final boolean enabled) {
   // ... 省略无关代码
   // 设置 需要重新分片的标记
   shardingService.setReshardingFlag();
  // ... 省略无关代码
}
```

**第二种**，作业分片总数( `JobCoreConfiguration.shardingTotalCount` )变化时。

```Java
// ShardingTotalCountChangedJobListener.java
class ShardingTotalCountChangedJobListener extends AbstractJobListener {
   
   @Override
   protected void dataChanged(final String path, final Type eventType, final String data) {
       if (configNode.isConfigPath(path)
               && 0 != JobRegistry.getInstance().getCurrentShardingTotalCount(jobName)) {
           int newShardingTotalCount = LiteJobConfigurationGsonFactory.fromJson(data).getTypeConfig().getCoreConfig().getShardingTotalCount();
           if (newShardingTotalCount != JobRegistry.getInstance().getCurrentShardingTotalCount(jobName)) { // 作业分片总数变化
               // 设置需要重新分片的标记
               shardingService.setReshardingFlag();
               // 设置当前分片总数
               JobRegistry.getInstance().setCurrentShardingTotalCount(jobName, newShardingTotalCount);
           }
       }
   }
}
```

**第三种**，服务器变化时。

```Java
// ShardingListenerManager.java
class ListenServersChangedJobListener extends AbstractJobListener {

   @Override
   protected void dataChanged(final String path, final Type eventType, final String data) {
       if (!JobRegistry.getInstance().isShutdown(jobName)
               && (isInstanceChange(eventType, path)
                   || isServerChange(path))) {
           shardingService.setReshardingFlag();
       }
   }
   
   private boolean isInstanceChange(final Type eventType, final String path) {
       return instanceNode.isInstancePath(path) && Type.NODE_UPDATED != eventType;
   }
   
   private boolean isServerChange(final String path) {
       return serverNode.isServerPath(path);
   }
}
```

* 服务器变化有**两种**情况。
* 第一种，`#isServerChange(...)` 服务器被开启或禁用。
* 第二种，`#isInstanceChange(...)` 作业节点新增或者移除。

**第四种**，在[《Elastic-Job-Lite 源码解析 —— 自诊断修复》](http://www.yunai.me/images/common/wechat_mp_2017_07_31_bak.jpg)详细分享。

# 3. 作业分片分配

# 4. 作业分片获取

