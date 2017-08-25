title: Elastic-Job-Lite 源码分析 —— 作业分片策略
date: 2017-10-26
tags:
categories: Elastic-Job
permalink: Elastic-Job/job-sharding-strategy

-------

**本文基于 Elastic-Job V2.1.5 版本分享**

-------

# 1. 概述

本文主要分享 **Elastic-Job-Lite 作业分片策略**。


涉及到主要类的类图如下( [打开大图](http://www.yunai.me/images/Elastic-Job/2017_10_26/01.png) )：

![](http://www.yunai.me/images/Elastic-Job/2017_10_26/01.png)

# 2. 自带作业分片策略

JobShardingStrategy，作业分片策略**接口**。分片策略通过实现接口的 `#sharding(...)` 方法提供作业分片的**计算**。

```Java
public interface JobShardingStrategy {
    
    /**
     * 作业分片.
     * 
     * @param jobInstances 所有参与分片的单元列表
     * @param jobName 作业名称
     * @param shardingTotalCount 分片总数
     * @return 分片结果
     */
    Map<JobInstance, List<Integer>> sharding(List<JobInstance> jobInstances, String jobName, int shardingTotalCount);
}
```

Elastic-Job-Lite 提供三种自带的作业分片策略：

* AverageAllocationJobShardingStrategy：基于平均分配算法的分片策略。
* OdevitySortByNameJobShardingStrategy：根据作业名的哈希值奇偶数决定IP升降序算法的分片策略。
* RotateServerByNameJobShardingStrategy：根据作业名的哈希值对服务器列表进行轮转的分片策略。

## 2.1 AverageAllocationJobShardingStrategy

AverageAllocationJobShardingStrategy，基于平均分配算法的分片策略。**Elastic-Job-Lite 默认的作业分片策略**。

> 如果分片不能整除，则不能整除的多余分片将依次追加到序号小的服务器。如：  
> 如果有3台服务器，分成9片，则每台服务器分到的分片是：1=[0,1,2], 2=[3,4,5], 3=[6,7,8]  
> 如果有3台服务器，分成8片，则每台服务器分到的分片是：1=[0,1,6], 2=[2,3,7], 3=[4,5]  
> 如果有3台服务器，分成10片，则每台服务器分到的分片是：1=[0,1,2,9], 2=[3,4,5], 3=[6,7,8]  

代码实现如下：

```Java
public final class AverageAllocationJobShardingStrategy implements JobShardingStrategy {
    
    @Override
    public Map<JobInstance, List<Integer>> sharding(final List<JobInstance> jobInstances, final String jobName, final int shardingTotalCount) {
        // 不存在 作业运行实例
        if (jobInstances.isEmpty()) {
            return Collections.emptyMap();
        }
        // 分配能被整除的部分
        Map<JobInstance, List<Integer>> result = shardingAliquot(jobInstances, shardingTotalCount);
        // 分配不能被整除的部分
        addAliquant(jobInstances, shardingTotalCount, result);
        return result;
    }
}
```

* 调用 `#shardingAliquot(...)` 方法分配能**被整除**的部分。能整除的咱就不举例子。如果有 3 台服务器，分成 8 片，被整除的部分是前 6 片 [0, 5]，调用该方法结果：1=[0,1], 2=[2,3], 3=[4,5]。

    ```Java
    private Map<JobInstance, List<Integer>> shardingAliquot(final List<JobInstance> shardingUnits, final int shardingTotalCount) {
       Map<JobInstance, List<Integer>> result = new LinkedHashMap<>(shardingTotalCount, 1);
       int itemCountPerSharding = shardingTotalCount / shardingUnits.size(); // 每个作业运行实例分配的平均分片数
       int count = 0;
       for (JobInstance each : shardingUnits) {
           List<Integer> shardingItems = new ArrayList<>(itemCountPerSharding + 1);
           // 顺序向下分配
           for (int i = count * itemCountPerSharding; i < (count + 1) * itemCountPerSharding; i++) {
               shardingItems.add(i);
           }
           result.put(each, shardingItems);
           count++;
       }
       return result;
    }
    ```
* 调用 `#addAliquant(...)` 方法分配能**不被整除**的部分。继续上面的例子。不能被整除的部分是后 2 片 [6, 7]，调用该方法结果：1=[0,1] + **[6]**, 2=[2,3] + **[7]**, 3=[4,5]。

    ```Java
    private void addAliquant(final List<JobInstance> shardingUnits, final int shardingTotalCount, final Map<JobInstance, List<Integer>> shardingResults) {
       int aliquant = shardingTotalCount % shardingUnits.size(); // 余数
       int count = 0;
       for (Map.Entry<JobInstance, List<Integer>> entry : shardingResults.entrySet()) {
           if (count < aliquant) {
               entry.getValue().add(shardingTotalCount / shardingUnits.size() * shardingUnits.size() + count);
           }
           count++;
       }
    }
    ```

**如何实现主备**

通过作业配置设置总分片数为 1 ( `JobCoreConfiguration.shardingTotalCount = 1` )，只有一个作业分片能够分配到作业分片项，从而达到**一主N备**。

## 2.2 OdevitySortByNameJobShardingStrategy

OdevitySortByNameJobShardingStrategy，根据作业名的哈希值奇偶数决定IP升降序算法的分片策略。

> 作业名的哈希值为奇数则IP **降序**.  
> 作业名的哈希值为偶数则IP **升序**.  
> 用于不同的作业平均分配负载至不同的服务器.  
> 如:   
> 1. 如果有3台服务器, 分成2片, 作业名称的哈希值为奇数, 则每台服务器分到的分片是: 1=[ ], 2=[1], 3=[0].  
> 2. 如果有3台服务器, 分成2片, 作业名称的哈希值为偶数, 则每台服务器分到的分片是: 1=[0], 2=[1], 3=[ ].

实现代码如下：

```Java
@Override
public Map<JobInstance, List<Integer>> sharding(final List<JobInstance> jobInstances, final String jobName, final int shardingTotalCount) {
   long jobNameHash = jobName.hashCode();
   if (0 == jobNameHash % 2) {
       Collections.reverse(jobInstances);
   }
   return averageAllocationJobShardingStrategy.sharding(jobInstances, jobName, shardingTotalCount);
}
```

* 从实现代码上，仿佛和 IP 升降序没什么关系？答案在传递进来的参数 `jobInstances`。`jobInstances` 已经是按照 IP 进行**降序**的数组。所以当判断到作业名的哈希值为偶数时，进行数组反转( `Collections#reverse(...)` )实现按照 IP **升序**。下面看下为什么说`jobInstances` 已经按照 IP 进行**降序**：

    ```Java
    @Override
    public List<String> getChildrenKeys(final String key) {
       try {
           List<String> result = client.getChildren().forPath(key);
           Collections.sort(result, new Comparator<String>() {
               
               @Override
               public int compare(final String o1, final String o2) {
                   return o2.compareTo(o1);
               }
           });
           return result;
       } catch (final Exception ex) {
           RegExceptionHandler.handleException(ex);
           return Collections.emptyList();
       }
    }
    ```
* 调用 `AverageAllocationJobShardingStrategy#sharding(...)` 方法完成最终作业分片计算。

## 2.3 RotateServerByNameJobShardingStrategy

RotateServerByNameJobShardingStrategy，根据作业名的哈希值对服务器列表进行**轮转**的分片策略。这里的**轮转**怎么定义呢？如果有 3 台服务器，顺序为 [0, 1, 2]，如果作业名的哈希值根据作业分片总数取模为 1, 服务器顺序变为 [1, 2, 0]。分片的目的是将作业的负载合理的分配到不同的服务器上，要避免分片策略总是让固定的服务器负载特别大。这个也是为什么**官方**对比 RotateServerByNameJobShardingStrategy、AverageAllocationJobShardingStrategy 如下：

> AverageAllocationJobShardingStrategy的缺点是，一旦分片数小于作业服务器数，作业将永远分配至IP地址靠前的服务器，导致IP地址靠后的服务器空闲。如：   
> OdevitySortByNameJobShardingStrategy则可以根据作业名称重新分配服务器负载。  
> 如果有3台服务器，分成2片，作业名称的哈希值为奇数，则每台服务器分到的分片是：1=[0], 2=[1], 3=[]  
> 如果有3台服务器，分成2片，作业名称的哈希值为偶数，则每台服务器分到的分片是：3=[0], 2=[1], 1=[]  

实现代码如下：

```Java
public final class RotateServerByNameJobShardingStrategy implements JobShardingStrategy {
    
    private AverageAllocationJobShardingStrategy averageAllocationJobShardingStrategy = new AverageAllocationJobShardingStrategy();
    
    @Override
    public Map<JobInstance, List<Integer>> sharding(final List<JobInstance> jobInstances, final String jobName, final int shardingTotalCount) {
        return averageAllocationJobShardingStrategy.sharding(rotateServerList(jobInstances, jobName), jobName, shardingTotalCount);
    }
    
    private List<JobInstance> rotateServerList(final List<JobInstance> shardingUnits, final String jobName) {
        int shardingUnitsSize = shardingUnits.size();
        int offset = Math.abs(jobName.hashCode()) % shardingUnitsSize; // 轮转开始位置
        if (0 == offset) {
            return shardingUnits;
        }
        List<JobInstance> result = new ArrayList<>(shardingUnitsSize);
        for (int i = 0; i < shardingUnitsSize; i++) {
            int index = (i + offset) % shardingUnitsSize;
            result.add(shardingUnits.get(index));
        }
        return result;
    }
}
```

* 调用 `#rotateServerList(...)` 实现服务器数组**轮转**。
* 调用 `AverageAllocationJobShardingStrategy#sharding(...)` 方法完成最终作业分片计算。

# 3. 自定义作业分片策略

可能在你的业务场景下，需要实现自定义的作业分片策略。通过定义类实现 JobShardingStrategy 接口即可：

```Java
public final class OOXXShardingStrategy implements JobShardingStrategy {

    @Override
    public Map<JobInstance, List<Integer>> sharding(final List<JobInstance> jobInstances, final String jobName, final int shardingTotalCount) {
        // 实现逻辑
    }

}
```

实现后，配置实现类的**全路径**到 Lite作业配置( LiteJobConfiguration )的 `jobShardingStrategyClass` 属性。

作业进行分片计算时，作业分片策略工厂( JobShardingStrategyFactory ) 会创建作业分片策略实例：

```Java
public final class JobShardingStrategyFactory {
    
    /**
     * 获取作业分片策略实例.
     * 
     * @param jobShardingStrategyClassName 作业分片策略类名
     * @return 作业分片策略实例
     */
    public static JobShardingStrategy getStrategy(final String jobShardingStrategyClassName) {
        if (Strings.isNullOrEmpty(jobShardingStrategyClassName)) {
            return new AverageAllocationJobShardingStrategy();
        }
        try {
            Class<?> jobShardingStrategyClass = Class.forName(jobShardingStrategyClassName);
            if (!JobShardingStrategy.class.isAssignableFrom(jobShardingStrategyClass)) {
                throw new JobConfigurationException("Class '%s' is not job strategy class", jobShardingStrategyClassName);
            }
            return (JobShardingStrategy) jobShardingStrategyClass.newInstance();
        } catch (final ClassNotFoundException | InstantiationException | IllegalAccessException ex) {
            throw new JobConfigurationException("Sharding strategy class '%s' config error, message details are '%s'", jobShardingStrategyClassName, ex.getMessage());
        }
    }
}
```

# 666. 彩蛋

旁白君：雾草，刚夸奖你，就又开始水更。  
芋道君：咳咳咳，作业分片策略炒鸡重要的好不好！嘿嘿嘿，为[《Elastic-Job-Lite 源码分析 —— 作业分片》](http://www.yunai.me/images/common/wechat_mp_2017_07_31_bak.jpg)做个铺垫嘛。

![](http://www.yunai.me/images/Elastic-Job/2017_10_26/02.png)

道友，赶紧上车，分享一波朋友圈！


