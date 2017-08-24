title: Elastic-Job-Lite 源码分析 —— 主节点选举
date: 2017-10-21
tags:
categories: Elastic-Job
permalink: Elastic-Job/election

-------



-------

# 1. 概述

本文主要分享 **Elastic-Job-Lite 主节点选举**。

建议前置阅读：

* [《Elastic-Job-Lite 源码分析 —— 注册中心》](http://www.yunai.me/Elastic-Job/reg-center-zookeeper/?self)
* [《Elastic-Job-Lite 源码分析 —— 作业数据存储》](http://www.yunai.me/Elastic-Job/job-storage/?self)
* [《Elastic-Job-Lite 源码分析 —— 注册中心监听器》](http://www.yunai.me/Elastic-Job/reg-center-zookeeper-listener/?self)

涉及到主要类的类图如下( [打开大图](http://www.yunai.me/images/Elastic-Job/2017_10_21/01.png) )：

![](http://www.yunai.me/images/Elastic-Job/2017_10_21/01.png)

* 粉色的类在 `com.dangdang.ddframe.job.lite.internal.election` 包下，实现了 Elastic-Job-Lite 主节点选举。

> 你行好事会因为得到赞赏而愉悦  
> 同理，开源项目贡献者会因为 Star 而更加有动力  
> 为 Elastic-Job 点赞！[传送门](https://github.com/dangdangdotcom/elastic-job/stargazers)

# 2. 为什么需要选举主节点

首先我们来看一段**官方**对 Elastic-Job-Lite 的介绍：

> Elastic-Job-Lite 定位为轻量级无中心化解决方案，使用 jar 包的形式提供分布式任务的协调服务。

**无中心化**，意味着 Elastic-Job-Lite 不存在**一个中心**执行一些操作，例如：作业分片项分配。Elastic-Job-Lite 选举主节点，通过主节点进行作业分片项分配。目前，必须在主节点执行的操作有：作业分片项分配，调解分布式作业不一致状态。

另外，主节点的选举是以**作业为维度**。例如：有一个 Elastic-Job-Lite 集群有三个作业节点 `A`、`B`、`C`，存在两个作业 `a`、`b`，可能 `a` 作业的主节点是 `C`，`b` 作业的主节点是 `A`。

# 3. 选举主节点

调用 `LeaderService#electLeader()` 选举主节点。

大体流程如下( [打开大图](http://www.yunai.me/images/Elastic-Job/2017_10_21/02.png) )：
![](http://www.yunai.me/images/Elastic-Job/2017_10_21/02.png)

实现代码如下：

```Java
// LeaderService.java
/**
* 选举主节点.
*/
public void electLeader() {
   log.debug("Elect a new leader now.");
   jobNodeStorage.executeInLeader(LeaderNode.LATCH, new LeaderElectionExecutionCallback());
   log.debug("Leader election completed.");
}

// JobNodeStorage.java
public void executeInLeader(final String latchNode, final LeaderExecutionCallback callback) {
   try (LeaderLatch latch = new LeaderLatch(getClient(), jobNodePath.getFullPath(latchNode))) {
       latch.start();
       latch.await();
       callback.execute();
   } catch (final Exception ex) {
       handleException(ex);
   }
}

// LeaderElectionExecutionCallback.java
class LeaderElectionExecutionCallback implements LeaderExecutionCallback {
   
   @Override
   public void execute() {
       if (!hasLeader()) { // 当前无主节点
           jobNodeStorage.fillEphemeralJobNode(LeaderNode.INSTANCE, JobRegistry.getInstance().getJobInstance(jobName).getJobInstanceId());
       }
   }
}
```

* 使用 Curator LeaderLatch 分布式锁，**保证同一时间有且仅有一个工作节点**能够调用 `LeaderElectionExecutionCallback#execute()` 方法执行主节点设置。Curator LeaderLatch 在[《Elastic-Job-Lite 源码分析 —— 注册中心》「3.1」在主节点执行操作](http://www.yunai.me/Elastic-Job/reg-center-zookeeper/?self)有详细解析。
* 在 `LeaderElectionExecutionCallback#execute()` 为什么要调用 `#hasLeader()` 呢？LeaderLatch **只保证同一时间有且仅有一个工作节点**，在获得分布式锁的工作节点结束逻辑后，第二个工作节点会开始逻辑，如果不判断当前是否有主节点，原来的主节点会被覆盖。

    ```Java
    // LeaderService.java
    /**
     * 判断是否已经有主节点.
     * 
     * @return 是否已经有主节点
     */
    public boolean hasLeader() {
        return jobNodeStorage.isJobNodeExisted(LeaderNode.INSTANCE);
    }
    ```
* 选举成功后，Zookeeper 存储**作业**的主节点：`/${JOB_NAME}/leader/electron/instance` 为当前节点。

    ``` bash
    [zk: localhost:2181(CONNECTED) 7] get /elastic-job-example-lite-java/javaSimpleJob/leader/election/instance
192.168.16.137@-@82496
    ```   

****


# 4. 删除主节点

# 666. 彩蛋

