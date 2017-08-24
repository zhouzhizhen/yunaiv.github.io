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

* 使用 Curator LeaderLatch 分布式锁，**保证同一时间有且仅有一个工作节点**能够调用 `LeaderElectionExecutionCallback#execute()` 方法执行主节点设置。Curator LeaderLatch 在[《Elastic-Job-Lite 源码分析 —— 注册中心》「3.1 在主节点执行操作」](http://www.yunai.me/Elastic-Job/reg-center-zookeeper/?self)有详细解析。
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
* 选举成功后，Zookeeper 存储**作业**的主节点：`/${JOB_NAME}/leader/electron/instance` 为当前节点。该节点为**临时**节点。

    ``` bash
    [zk: localhost:2181(CONNECTED) 7] get /elastic-job-example-lite-java/javaSimpleJob/leader/election/instance
192.168.16.137@-@82496
    ```   

**选举主节点时机**

**第一种**，注册作业启动信息时。

```Java
/**
* 注册作业启动信息.
* 
* @param enabled 作业是否启用
*/
public void registerStartUpInfo(final boolean enabled) {
   // .... 省略部分方法
   // 选举 主节点
   leaderService.electLeader();
   // .... 省略部分方法
}
```

* 新的作业启动时，即能保证选举出主节点。
    * 当该作业**不存在**主节点时，当前作业节点**成为**主节点。
    * 当该作业**存在**主节点，当前作业节主节点**不变**。

**第二种**，节点数据发生变化时。

```Java
class LeaderElectionJobListener extends AbstractJobListener {
   
   @Override
   protected void dataChanged(final String path, final Type eventType, final String data) {
       if (!JobRegistry.getInstance().isShutdown(jobName) && (isActiveElection(path, data) || isPassiveElection(path, eventType))) {
           leaderService.electLeader();
       }
   }
}
```

* 符合重新选举主节点分成两种情况。
* **主动**选举 `#isActiveElection(...)`

    ```Java
    private boolean isActiveElection(final String path, final String data) {
        return !leaderService.hasLeader() // 不存在主节点
              && isLocalServerEnabled(path, data); // 开启作业
    }
    
    private boolean isLocalServerEnabled(final String path, final String data) {
        return serverNode.isLocalServerPath(path) 
           && !ServerStatus.DISABLED.name().equals(data);
    }
    ```
    * 当作业被禁用( `LiteJobConfiguration.disabled = true` )时，作业是不存在主节点的。那有同学就有疑问了？`LeaderService#electLeader()` 没做这个限制呀，作业**注册作业启动信息时**也进行了选举。在「4. 删除主节点」小结，我们会解开这个答案。这里大家先记住这个结论。
    * 根据上面我们说的结论，这里就很好理解了，`#isActiveElection()` 方法判断了两个条件：( 1 ) 不存在主节点；( 2 ) 开启作业，不再禁用，因此需要进行主节点选举落。
    * 这里判断开启作业的方法 `#isLocalServerEnabled(...)` 有点特殊，它不是通过作业节点是否处于开启状态，而是该数据不是讲作业节点更新成关闭状态。
    * [ ]TODO：这里解释的比较绕，后续想想怎么优化优化。

* **被动**选举 `#isPassiveElection(...)`

    ```Java
    private boolean isPassiveElection(final String path, final Type eventType) {
      return isLeaderCrashed(path, eventType) // 主节点 Crashed
              && serverService.isAvailableServer(JobRegistry.getInstance().getJobInstance(jobName).getIp()); // 当前节点正在运行中（未挂掉）
    }
       
    private boolean isLeaderCrashed(final String path, final Type eventType) {
      return leaderNode.isLeaderInstancePath(path) && Type.NODE_REMOVED == eventType;
    }
    ```
    * 当主节点因为各种情况( 「4. 删除主节点」会列举 )被删除，需要重新进行选举。对的，**必须主节点被删除后才可以重新进行选举**。
    * `isPassiveElection(...)` 方法判断了两个条件：( 1 ) 原主节点被删除；( 2 ) 当前节点正在运行中（未挂掉），可以参加主节点选举。

# 4. 删除主节点

有主节点的选举，必然有主节点的删除，否则怎么进行**重新选举**。

**删除主节点时机**

**第一种**，主节点关闭进程时。

```Java
public final class JobShutdownHookPlugin extends ShutdownHookPlugin {
    
    @Override
    public void shutdown() {
        CoordinatorRegistryCenter regCenter = JobRegistry.getInstance().getRegCenter(jobName);
        if (null == regCenter) {
            return;
        }
        LeaderService leaderService = new LeaderService(regCenter, jobName);
        if (leaderService.isLeader()) {
            leaderService.removeLeader(); // 移除主节点
        }
        new InstanceService(regCenter, jobName).removeInstance();
    }
}
```

* 这个比较好理解，退出进程，若该进程为主节点，需要将自己移除。

**第二种**，作业被**禁用**时。

```Java
class LeaderAbdicationJobListener extends AbstractJobListener {
   
   @Override
   protected void dataChanged(final String path, final Type eventType, final String data) {
       if (leaderService.isLeader() && isLocalServerDisabled(path, data)) {
           leaderService.removeLeader();
       }
   }
   
   private boolean isLocalServerDisabled(final String path, final String data) {
       return serverNode.isLocalServerPath(path) && ServerStatus.DISABLED.name().equals(data);
   }
}
```

* 这里就解答上面我们遗留的疑问。被禁用的作业**注册作业启动信息时**也进行了选举，会被该监听器处理，移除该选举。

**第三种**，笔者暂时未想明白，先贴出代码。

```Java
// InstanceShutdownStatusJobListener.java
class InstanceShutdownStatusJobListener extends AbstractJobListener {
   
   @Override
   protected void dataChanged(final String path, final Type eventType, final String data) {
       if (!JobRegistry.getInstance().isShutdown(jobName)
               && !JobRegistry.getInstance().getJobScheduleController(jobName).isPaused() // 作业未暂停调度
               && isRemoveInstance(path, eventType) // 运行实例被移除
               && !isReconnectedRegistryCenter()) { //
           schedulerFacade.shutdownInstance();
       }
   }
   
   private boolean isRemoveInstance(final String path, final Type eventType) {
       return instanceNode.isLocalInstancePath(path) && Type.NODE_REMOVED == eventType;
   }
   
   private boolean isReconnectedRegistryCenter() {
       return instanceService.isLocalJobInstanceExisted();
   }
}

// SchedulerFacade.java
/**
* 终止作业调度.
*/
public void shutdownInstance() {
   if (leaderService.isLeader()) {
       leaderService.removeLeader();
   }
   monitorService.close();
   if (reconcileService.isRunning()) {
       reconcileService.stopAsync();
   }
   JobRegistry.getInstance().shutdown(jobName);
}
```

# 666. 彩蛋

