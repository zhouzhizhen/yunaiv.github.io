title: TCC-Transaction 源码分析 —— TCC 实现
date: 2018-02-08
tags:
categories: TCC-Transaction
permalink: TCC-Transaction/tcc-core

---

# 1. 概述

本文分享 **TCC 实现**。主要涉及如下三个 Maven 项目：

* `tcc-transaction-core` ：tcc-transaction 底层实现。
* `tcc-transaction-api` ：tcc-transaction 使用 API。
* `tcc-transaction-spring` ：tcc-transaction Spring 支持。

下面一起来简单理解下 **TCC 型事务的概念**。

> FROM https://support.hwclouds.com/devg-servicestage/zh-cn_topic_0056814426.html  
> **TCC事务**  
> 为了解决在事务运行过程中大颗粒度资源锁定的问题，业界提出一种新的事务模型，它是基于**业务层面**的事务定义。锁粒度完全由业务自己控制。它本质是一种补偿的思路。它把事务运行过程分成 Try、Confirm / Cancel 两个阶段。在每个阶段的逻辑由**业务代码控制**。这样就事务的锁粒度可以完全自由控制。业务可以在牺牲隔离性的情况下，获取更高的性能。

* Try 阶段
    * Try ：尝试执行业务 
        * 完成所有业务检查( 一致性 ) 
        * 预留必须业务资源( 准隔离性 )
* Confirm / Cancel 阶段：
    * Confirm ：确认执行业务
        * 真正执行业务
        * 不做任务业务检查
        * Confirm 操作满足幂等性
    * Cancel ：取消执行业务
        * 释放 Try 阶段预留的业务资源
        * Cancel 操作满足幂等性 
    * Confirm 与 Cancel 互斥

整体流程如下图：

![](../../../images/TCC-Transaction/2018_02_08/01.jpeg)

* **红框部分**功能由 `tcc-transaction-core` 实现：
    * 启动业务活动
    * 登记业务操作
    * 提交 / 回滚业务活动

* **黄框部分**功能由 `tcc-transaction-http-sample` 实现( 官方提供的示例项目 )：
    * Try 操作
    * Confirm 操作
    * Cancel 操作 

// TODO TCC 与 2PC

参考资料：

* [《支付宝运营架构中柔性事务指的是什么？》](https://www.zhihu.com/question/31813039)
* [《分布式事务的典型处理方式:2PC、TCC、异步确保和最大努力型》](http://kaimingwan.com/post/fen-bu-shi/fen-bu-shi-shi-wu-de-dian-xing-chu-li-fang-shi-2pc-tcc-yi-bu-que-bao-he-zui-da-nu-li-xing)

> 你行好事会因为得到赞赏而愉悦  
> 同理，开源项目贡献者会因为 Star 而更加有动力  
> 为 TCC-Transaction 点赞！[传送门](https://github.com/changmingxie/tcc-transaction)

OK，开始我们的第一段 TCC 旅程吧。

ps：笔者假设你已经阅读过[《tcc-transaction 官方文档 —— 使用指南1.2.x》](https://github.com/changmingxie/tcc-transaction/wiki/%E4%BD%BF%E7%94%A8%E6%8C%87%E5%8D%971.2.x)。

ps2：**未特殊说明的情况下，本文事务指的是 TCC事务**。

ps3：本文采用**"倒序"**( 例如，Domain => Dao => Service => Controller )分享代码实现，建议阅读方式：简读 x 1 + 深读 x 1。采用**"倒序"**的方式，你可以比较整体的理解每一层的实现。

# 2. 事务与参与者

在 TCC 里，**一个**事务( `org.mengyun.tcctransaction.Transaction` ) 可以有**多个**参与者( `org.mengyun.tcctransaction.Participant` )参与业务活动。类图关系如下( [打开大图](../../../images/TCC-Transaction/2018_02_08/02.png) )：

![](../../../images/TCC-Transaction/2018_02_08/02.png)

**Transaction 实现代码如下**：

```Java
public class Transaction implements Serializable {

    private static final long serialVersionUID = 7291423944314337931L;

    /**
     * 事务编号
     */
    private TransactionXid xid;
    /**
     * 事务状态
     */
    private TransactionStatus status;
    /**
     * 事务类型
     */
    private TransactionType transactionType;
    /**
     * 重试次数
     */
    private volatile int retriedCount = 0;
    /**
     * 创建时间
     */
    private Date createTime = new Date();
    /**
     * 最后更新时间
     */
    private Date lastUpdateTime = new Date();
    /**
     * 版本号
     */
    private long version = 1;
    /**
     * 参与者集合
     */
    private List<Participant> participants = new ArrayList<Participant>();
    /**
     * 附带属性映射
     */
    private Map<String, Object> attachments = new ConcurrentHashMap<String, Object>();
    
    /**
     * 添加参与者
     *
     * @param participant 参与者
     */
    public void enlistParticipant(Participant participant) {
        participants.add(participant);
    }

    /**
     * 提交 TCC 事务
     */
    public void commit() {
        for (Participant participant : participants) {
            participant.commit();
        }
    }

    /**
     * 回滚 TCC 事务
     */
    public void rollback() {
        for (Participant participant : participants) {
            participant.rollback();
        }
    }
}
```

* xid，事务编号( TransactionXid )，用于唯一标识一个事务。使用 UUID 算法生成，**保证唯一性**。`org.mengyun.tcctransaction.api.TransactionXid` 实现 [`javax.transaction.xa.Xid`](https://docs.oracle.com/javase/8/docs/api/javax/transaction/xa/Xid.html) 接口，实现代码如下：

    ```Java
    public class TransactionXid implements Xid, Serializable {
        private static final long serialVersionUID = -6817267250789142043L;

        /**
         * xid 格式标识符
         */
        private int formatId = 1;
        /**
         * 全局事务编号
         */
        private byte[] globalTransactionId;
        /**
         * 分支事务编号
         */
        private byte[] branchQualifier;
        
    }
    ``` 
    * TODO 为什么要继承 Xid 接口？
    * 一个**全局事务**包含的多个参与者，每个参与者都形成自己的**分支事务**，它们使用全局事务编号( `globalTransactionId` ) 进行关联。下文会看到这块具体的代码实现。TODO
* status，事务状态( TransactionStatus )。`org.mengyun.tcctransaction.api.TransactionStatus` 实现代码如下：

    ```Java
    public enum TransactionStatus {
        /**
         * 尝试中状态
         */
        TRYING(1),
        /**
         * 确认中状态
         */
        CONFIRMING(2),
        /**
         * 取消中状态
         */
        CANCELLING(3);
    
        private int id;
    }
    ```

* transactionType，事务类型( TransactionType )。`org.mengyun.tcctransaction.common.TransactionType` 实现代码如下：

    ```Java
    public enum TransactionType {
    
        /**
         * 全局事务
         */
        ROOT(1),
        /**
         * 分支事务
         */
        BRANCH(2);
    
        int id;
    }
    ```

* retriedCount，重试次数。在 TCC 过程中，可能参与者异常崩溃，这个时候会进行重试直到成功或超过最大次数。在[《TCC-Transaction 源码解析 —— 事务恢复》](http://www.iocoder.cn?todo)详细解析。
* version，版本号，用于乐观锁更新事务。下文会看到这块具体的代码实现。TODO
* participants，事务参与者集合。
* attachments，附带属性映射。在[《TCC-Transaction 源码解析 —— Dubbo 支持》](http://www.iocoder.cn?todo)详细解析。
* 提供 `#enlistParticipant()` 方法，添加事务参与者。
* 提供 `#commit()` 方法，调用参与者们提交事务。
* 提供 `#rollback()` 方法，调用参与者回滚事务。

**Participant 实现代码如下**：

```Java
public class Participant implements Serializable {

    private static final long serialVersionUID = 4127729421281425247L;

    /**
     * 事务编号
     */
    private TransactionXid xid;
    /**
     * 确认执行业务方法调用上下文
     */
    private InvocationContext confirmInvocationContext;
    /**
     * 取消执行业务方法
     */
    private InvocationContext cancelInvocationContext;
    /**
     * 执行器
     */
    private Terminator terminator = new Terminator();
    /**
     * 事务上下文编辑
     */
    Class<? extends TransactionContextEditor> transactionContextEditorClass;
    
    /**
     * 提交事务
     */
    public void commit() {
        terminator.invoke(new TransactionContext(xid, TransactionStatus.CONFIRMING.getId()), confirmInvocationContext, transactionContextEditorClass);
    }

    /**
     * 回滚事务
     */
    public void rollback() {
        terminator.invoke(new TransactionContext(xid, TransactionStatus.CANCELLING.getId()), cancelInvocationContext, transactionContextEditorClass);
    }
}
```

* xid，**分支**事务编号。
* confirmInvocationContext，确认执行业务方法调用上下文( InvocationContext )。`org.mengyun.tcctransaction.InvocationContext` 实现代码如下：

    ```Java
    public class InvocationContext implements Serializable {
    
        private static final long serialVersionUID = -7969140711432461165L;
    
        /**
         * 类
         */
        private Class targetClass;
        /**
         * 方法名
         */
        private String methodName;
        /**
         * 参数类型数组
         */
        private Class[] parameterTypes;
        /**
         * 参数数组
         */
        private Object[] args;
    }
    ```
    * InvocationContext，执行方法调用上下文，记录类、方法名、参数类型数组、参数数组。通过这些属性，可以执行提交 / 回滚事务。在 `org.mengyun.tcctransaction.Terminator` 会看到具体的代码实现。

* cancelInvocationContext，取消执行业务方法调用上下文( InvocationContext )。
* terminator，执行器( Terminator )。`org.mengyun.tcctransaction.Terminator` 实现代码如下：

    ```Java
    public class Terminator implements Serializable {
    
        private static final long serialVersionUID = -164958655471605778L;
    
        public Object invoke(TransactionContext transactionContext, InvocationContext invocationContext, Class<? extends TransactionContextEditor> transactionContextEditorClass) {
            if (StringUtils.isNotEmpty(invocationContext.getMethodName())) {
                try {
                    // 获得 参与者对象
                    Object target = FactoryBuilder.factoryOf(invocationContext.getTargetClass()).getInstance();
                    // 获得 方法
                    Method method = target.getClass().getMethod(invocationContext.getMethodName(), invocationContext.getParameterTypes());
                    // 设置 事务上下文 到方法参数
                    FactoryBuilder.factoryOf(transactionContextEditorClass).getInstance().set(transactionContext, target, method, invocationContext.getArgs());
                    // 执行方法
                    return method.invoke(target, invocationContext.getArgs());
                } catch (Exception e) {
                    throw new SystemException(e);
                }
            }
            return null;
        }
    
    }
    ```
    * TODO FactoryBuilder
    * TransactionContextEditor，在本文[「4.1 Compensable」](#)详细解析。
* transactionContextEditorClass，TODO
* 提交 `#commit()` 方法，提交参与者自己的事务。
* 提交 `#rollback()` 方法，回滚参与者自己的事务。 


# 3. 事务管理器

`org.mengyun.tcctransaction.TransactionManager`，事务管理器，提供事务的获取、发起、提交、回滚，参与者的新增等等方法。

## 3.1 发起根事务

提供 `begin()` 方法，发起根事务。该方法在**调用方法类型为 MethodType.ROOT 并且 事务处于 Try 阶段**被调用。TODO

实现代码如下：

```Java
// TransactionManager.java
/**
* 发起根事务
*
* @return 事务
*/
public Transaction begin() {
   // 创建 根事务
   Transaction transaction = new Transaction(TransactionType.ROOT);
   // 存储 事务
   transactionRepository.create(transaction);
   // 注册 事务
   registerTransaction(transaction);
   return transaction;
}
```

* 调用 Transaction 构造方法，创建**根事务**。实现代码如下：

    ```Java
    // Transaction.java
    /**
    * 创建指定类型的事务
    *
    * @param transactionType 事务类型
    */
    public Transaction(TransactionType transactionType) {
       this.xid = new TransactionXid();
       this.status = TransactionStatus.TRYING; // 尝试中状态
       this.transactionType = transactionType;
    }
    ```
    * 目前该构造方法只有 `TransactionManager#begin()` 在调用，即只创建**根事务**。
* 调用 `TransactionRepository#crete()` 方法，存储事务。TODO
* 调用 `#registerTransaction(...)` 方法，注册事务到当前线程事务队列。实现代码如下：

    ```Java
    // TransactionManager.java
    /**
    * 当前线程事务队列
    */
    private static final ThreadLocal<Deque<Transaction>> CURRENT = new ThreadLocal<Deque<Transaction>>();
    
    /**
    * 注册事务到当前线程事务队列
    *
    * @param transaction 事务
    */
    private void registerTransaction(Transaction transaction) {
       if (CURRENT.get() == null) {
           CURRENT.set(new LinkedList<Transaction>());
       }
       CURRENT.get().push(transaction); // 添加到头部
    }
    ```
    * **可能有同学会比较好奇，为什么使用队列存储当前线程事务**？TCC-Transaction 支持**多个**的事务**独立存在**，后创建的事务先提交，类似 Spring 的`org.springframework.transaction.annotation.Propagation.REQUIRES_NEW` 。在下文，很快我们就会看到 TCC-Transaction 自己的 `org.mengyun.tcctransaction.api.Propagation` 。

    
## 3.2 传播发起分支事务

调用 `#propagationNewBegin(...)` 方法，传播发起**分支**事务。该方法在**调用方法类型为 MethodType.PROVIDER 并且 事务处于 Try 阶段**被调用。TODO

实现代码如下：

```Java
/**
* 传播发起分支事务
*
* @param transactionContext 事务上下文
* @return 分支事务
*/
public Transaction propagationNewBegin(TransactionContext transactionContext) {
  // 创建 分支事务
  Transaction transaction = new Transaction(transactionContext);
  // 存储 事务
  transactionRepository.create(transaction);
  // 注册 事务
  registerTransaction(transaction);
  return transaction;
}
```
* 调用 Transaction 构造方法，创建**分支事务**。实现代码如下：

    ```Java
    /**
    * 创建分支事务
    *
    * @param transactionContext 事务上下文
    */
    public Transaction(TransactionContext transactionContext) {
       this.xid = transactionContext.getXid(); // 事务上下文的 xid
       this.status = TransactionStatus.TRYING; // 尝试中状态
       this.transactionType = TransactionType.BRANCH; // 分支事务
    }
    ```
    * **分支**事务使用传播的事务上下文的事务编号。
* 调用 `TransactionRepository#crete()` 方法，存储事务。TODO 这里想想怎么说清楚。会在对应服务在存储一次transaction。
* 调用 `#registerTransaction(...)` 方法，注册事务到当前线程事务队列。

## 3.3 传播获取分支事务

调用 `#propagationExistBegin(...)` 方法，传播发起**分支**事务。该方法在**调用方法类型为 MethodType.PROVIDER 并且 事务处于 Confirm / Cancel 阶段**被调用。TODO

实现代码如下：

```Java
/**
* 传播获取分支事务
*
* @param transactionContext 事务上下文
* @return 分支事务
* @throws NoExistedTransactionException 当事务不存在时
*/
public Transaction propagationExistBegin(TransactionContext transactionContext) throws NoExistedTransactionException {
   // 查询 事务
   Transaction transaction = transactionRepository.findByXid(transactionContext.getXid());
   if (transaction != null) {
       // 设置 事务 状态
       transaction.changeStatus(TransactionStatus.valueOf(transactionContext.getStatus()));
       // 注册 事务
       registerTransaction(transaction);
       return transaction;
   } else {
       throw new NoExistedTransactionException();
   }
}
```

* 调用 `TransactionRepository#findByXid()` 方法，查询事务。
* 调用 `Transaction#changeStatus(...)` 方法，**设置**事务状态为 CONFIRMING 或 CANCELLING。
* 调用 `#registerTransaction(...)` 方法，注册事务到当前线程事务队列。
* 为什么此处是**分支**事务呢？结合 `#propagationNewBegin(...)` 思考下。 

## 3.4 提交事务

调用 `#commit(...)` 方法，提交事务。该方法在**事务处于 Confirm / Cancel 阶段**被调用。

实现代码如下：

```Java
/**
* 提交事务
*/
public void commit() {
   // 获取 事务
   Transaction transaction = getCurrentTransaction();
   // 设置 事务状态 为 CONFIRMING
   transaction.changeStatus(TransactionStatus.CONFIRMING);
   // 更新 事务
   transactionRepository.update(transaction);
   try {
       // 提交 事务
       transaction.commit();
       // 删除 事务
       transactionRepository.delete(transaction);
   } catch (Throwable commitException) {
       logger.error("compensable transaction confirm failed.", commitException);
       throw new ConfirmingException(commitException);
   }
}
```

* 调用 `#getCurrentTransaction()` 方法， 获取事务。实现代码如下：

    ```Java
    public Transaction getCurrentTransaction() {
       if (isTransactionActive()) {
           return CURRENT.get().peek(); // 获得头部元素
       }
       return null;
    }
    
    public boolean isTransactionActive() {
       Deque<Transaction> transactions = CURRENT.get();
       return transactions != null && !transactions.isEmpty();
    }
    ```
    * 为什么获得队列**头部**元素呢？该元素即是上文调用 `#registerTransaction(...)` 注册到队列头部。
* 调用 `Transaction#changeStatus(...)` 方法， **设置**事务状态为 CONFIRMING。
* 调用 `TransactionRepository#update(...)` 方法， **更新**事务。
* 调用 `Transaction#commit(...)` 方法， **提交**事务。
* 调用 `TransactionRepository#delete(...)` 方法，**删除**事务。

## 3.5 回滚事务

调用 `#rollback(...)` 方法，取消事务，和 `#commit()` 方法基本类似。该方法在**事务处于 Confirm / Cancel 阶段**被调用。

实现代码如下：

```Java
/**
* 回滚事务
*/
public void rollback() {
   // 获取 事务
   Transaction transaction = getCurrentTransaction();
   // 设置 事务状态 为 CANCELLING
   transaction.changeStatus(TransactionStatus.CANCELLING);
   // 更新 事务
   transactionRepository.update(transaction);
   try {
       // 提交 事务
       transaction.rollback();
       // 删除 事务
       transactionRepository.delete(transaction);
   } catch (Throwable rollbackException) {
       logger.error("compensable transaction rollback failed.", rollbackException);
       throw new CancellingException(rollbackException);
   }
}
```

* 调用 `#getCurrentTransaction()` 方法，获取事务。
* 调用 `Transaction#changeStatus(...)` 方法， **设置**事务状态为 CANCELLING。
* 调用 `TransactionRepository#update(...)` 方法， **更新**事务。
* 调用 `Transaction#rollback(...)` 方法， **回滚**事务。
* 调用 `TransactionRepository#delete(...)` 方法，**删除**事务。

## 3.6 添加参与者到事务

调用 `#enlistParticipant(...)` 方法，添加参与者到事务。该方法在**事务处于 Try 阶段**被调用。TODO

实现代码如下：

```Java
/**
* 添加参与者到事务
*
* @param participant 参与者
*/
public void enlistParticipant(Participant participant) {
   // 获取 事务
   Transaction transaction = this.getCurrentTransaction();
   // 添加参与者
   transaction.enlistParticipant(participant);
   // 更新 事务
   transactionRepository.update(transaction);
}
```

* 调用 `#getCurrentTransaction()` 方法，获取事务。
* 调用 `Transaction#enlistParticipant(...)` 方法， 添加参与者到事务。
* 调用 `TransactionRepository#update(...)` 方法， **更新**事务。

# 4. 事务拦截器

TCC-Transaction 基于 `org.mengyun.tcctransaction.api.@Compensable` **注解** + `org.aspectj.lang.annotation.@Aspect` **AOP 切面**实现业务方法的 TCC 事务声明**拦截**，同 Spring 的 `org.springframework.transaction.annotation.@Transactional` 的实现。

TCC-Transaction 有两个拦截器：

* `org.mengyun.tcctransaction.interceptor.CompensableTransactionInterceptor`，可补偿事务拦截器。
* `org.mengyun.tcctransaction.interceptor.ResourceCoordinatorInterceptor`，资源协调者拦截器。

在分享拦截器的实现之前，我们先一起看看 @Compensable 注解。

## 4.1 Compensable

@Compensable，标记可补偿的方法注解。实现代码如下：

```Java
public @interface Compensable {

    /**
     * 传播级别
     */
    Propagation propagation() default Propagation.REQUIRED;

    /**
     * 确认执行业务方法
     */
    String confirmMethod() default "";

    /**
     * 取消执行业务方法
     */
    String cancelMethod() default "";

    /**
     * 事务上下文编辑
     */
    Class<? extends TransactionContextEditor> transactionContextEditor() default DefaultTransactionContextEditor.class;
}
```

* propagation，传播级别( Propagation )，默认 Propagation.REQUIRED。和 Spring 的 Propagation 除了缺少几个属性，基本一致。实现代码如下：

    ```Java
    public enum Propagation {
    
        /**
         * 支持当前事务，如果当前没有事务，就新建一个事务。
         */
        REQUIRED(0),
        /**
         * 支持当前事务，如果当前没有事务，就以非事务方式执行。
         */
        SUPPORTS(1),
        /**
         * 支持当前事务，如果当前没有事务，就抛出异常。
         */
        MANDATORY(2),
        /**
         * 新建事务，如果当前存在事务，把当前事务挂起。
         */
        REQUIRES_NEW(3);
    
        private final int value;
    }
    ```

* confirmMethod，确认执行业务方法名。
* cancelMethod，取消执行业务方法名。
* TransactionContextEditor，事务上下文编辑器( TransactionContextEditor )，用于设置和获得事务上下文( TransactionContext )。`org.mengyun.tcctransaction.api.TransactionContextEditor` 接口代码如下：

    ```Java
    public interface TransactionContextEditor {
    
        /**
         * 从参数中获得事务上下文
         *
         * @param target 对象
         * @param method 方法
         * @param args 参数
         * @return 事务上下文
         */
        TransactionContext get(Object target, Method method, Object[] args);
    
        /**
         * 设置事务上下文到参数中
         *
         * @param transactionContext 事务上下文
         * @param target 对象
         * @param method 方法
         * @param args 参数
         */
        void set(TransactionContext transactionContext, Object target, Method method, Object[] args);
    
    }
    ```
    * DefaultTransactionContextEditor，**默认**事务上下文编辑器实现。实现代码如下：

        ```Java
        class DefaultTransactionContextEditor implements TransactionContextEditor {
    
            @Override
            public TransactionContext get(Object target, Method method, Object[] args) {
                int position = getTransactionContextParamPosition(method.getParameterTypes());
                if (position >= 0) {
                    return (TransactionContext) args[position];
                }
                return null;
            }
    
            @Override
            public void set(TransactionContext transactionContext, Object target, Method method, Object[] args) {
                int position = getTransactionContextParamPosition(method.getParameterTypes());
                if (position >= 0) {
                    args[position] = transactionContext; // 设置方法参数
                }
            }
    
            /**
             * 获得事务上下文在方法参数里的位置
             *
             * @param parameterTypes 参数类型集合
             * @return 位置
             */
            public static int getTransactionContextParamPosition(Class<?>[] parameterTypes) {
                int position = -1;
                for (int i = 0; i < parameterTypes.length; i++) {
                    if (parameterTypes[i].equals(org.mengyun.tcctransaction.api.TransactionContext.class)) {
                        position = i;
                        break;
                    }
                }
                return position;
            }
        }
        ```
        * x TODO 参数
        
  * NullableTransactionContextEditor，无事务上下文编辑器实现。实现代码如下：

       ```Java
       class NullableTransactionContextEditor implements TransactionContextEditor {
    
            @Override
            public TransactionContext get(Object target, Method method, Object[] args) {
                return null;
            }
    
            @Override
            public void set(TransactionContext transactionContext, Object target, Method method, Object[] args) {
            }
        }
       ```

  * DubboTransactionContextEditor，Dubbo 事务上下文编辑器实现，通过 Dubbo 隐式传参方式获得事务上下文，在[《TCC-Transaction 源码解析 —— Dubbo 支持》](http://www.iocoder.cn?todo)详细解析。

## 4.2 可补偿事务拦截器

先一起来看下可补偿事务拦截器对应的切面 `org.mengyun.tcctransaction.interceptor.CompensableTransactionAspect`，实现代码如下：

```Java
@Aspect
public abstract class CompensableTransactionAspect {

    private CompensableTransactionInterceptor compensableTransactionInterceptor;

    public void setCompensableTransactionInterceptor(CompensableTransactionInterceptor compensableTransactionInterceptor) {
        this.compensableTransactionInterceptor = compensableTransactionInterceptor;
    }

    @Pointcut("@annotation(org.mengyun.tcctransaction.api.Compensable)")
    public void compensableService() {
    }

    @Around("compensableService()")
    public Object interceptCompensableMethod(ProceedingJoinPoint pjp) throws Throwable {
        return compensableTransactionInterceptor.interceptCompensableMethod(pjp);
    }

    public abstract int getOrder();
}
```

* 通过 `org.aspectj.lang.annotation.@Pointcut` + `org.aspectj.lang.annotation.@Around` 注解，配置对 **@Compensable 注解的方法**进行拦截，调用 `CompensableTransactionInterceptor#interceptCompensableMethod(...)` 方法进行处理。

**CompensableTransactionInterceptor 实现代码如下**：

```Java
public class CompensableTransactionInterceptor {
    
    private TransactionManager transactionManager;

    private Set<Class<? extends Exception>> delayCancelExceptions;
    
    public Object interceptCompensableMethod(ProceedingJoinPoint pjp) throws Throwable {
        // 获得带 @Compensable 注解的方法
        Method method = CompensableMethodUtils.getCompensableMethod(pjp);
        //
        Compensable compensable = method.getAnnotation(Compensable.class);
        Propagation propagation = compensable.propagation();
        // 获得 事务上下文
        TransactionContext transactionContext = FactoryBuilder.factoryOf(compensable.transactionContextEditor()).getInstance().get(pjp.getTarget(), method, pjp.getArgs());
        // 当前线程是否在事务中
        boolean isTransactionActive = transactionManager.isTransactionActive();
        // 判断事务上下文是否合法
        if (!TransactionUtils.isLegalTransactionContext(isTransactionActive, propagation, transactionContext)) {
            throw new SystemException("no active compensable transaction while propagation is mandatory for method " + method.getName());
        }
        // 计算方法类型
        MethodType methodType = CompensableMethodUtils.calculateMethodType(propagation, isTransactionActive, transactionContext);
        // 处理
        switch (methodType) {
            case ROOT:
                return rootMethodProceed(pjp);
            case PROVIDER:
                return providerMethodProceed(pjp, transactionContext);
            default:
                return pjp.proceed();
        }
    }
}
```

* 调用 `CompensableMethodUtils#getCompensableMethod(...)` 方法，获得带 @Compensable 注解的方法。实现代码如下：

    ```Java
    // CompensableMethodUtils.java
    /**
    * 获得带 @Compensable 注解的方法
    *
    * @param pjp 切面点
    * @return 方法
    */
    public static Method getCompensableMethod(ProceedingJoinPoint pjp) {
       Method method = ((MethodSignature) (pjp.getSignature())).getMethod(); // 代理方法对象
       if (method.getAnnotation(Compensable.class) == null) {
           try {
               method = pjp.getTarget().getClass().getMethod(method.getName(), method.getParameterTypes()); // 实际方法对象
           } catch (NoSuchMethodException e) {
               return null;
           }
       }
       return method;
    }
    ```

* 调用 `TransactionContextEditor#get(...)` 方法，从参数中获得事务上下文。
* 调用 `TransactionManager#isTransactionActive()` 方法，当前线程是否在事务中。实现代码如下：

    ```Java
    // TransactionManager.java
    private static final ThreadLocal<Deque<Transaction>> CURRENT = new ThreadLocal<Deque<Transaction>>();
    
    public boolean isTransactionActive() {
       Deque<Transaction> transactions = CURRENT.get();
       return transactions != null && !transactions.isEmpty();
    }
    ```

* 调用 `TransactionUtils#isLegalTransactionContext(...)` 方法，判断事务上下文是否合法。实现代码如下：

    ```Java
    // TransactionUtils.java
    /**
    * 判断事务上下文是否合法
    * 在 Propagation.MANDATORY 必须有在事务内
    *
    * @param isTransactionActive 是否
    * @param propagation 传播级别
    * @param transactionContext 事务上下文
    * @return 是否合法
    */
    public static boolean isLegalTransactionContext(boolean isTransactionActive, Propagation propagation, TransactionContext transactionContext) {
       if (propagation.equals(Propagation.MANDATORY) && !isTransactionActive && transactionContext == null) {
           return false;
       }
       return true;
    }
    ```

* 调用 `CompensableMethodUtils#calculateMethodType(...)` 方法，计算方法类型。实现代码如下：

    ```Java
    /**
    * 计算方法类型
    *
    * @param propagation 传播级别
    * @param isTransactionActive 是否事务开启
    * @param transactionContext 事务上下文
    * @return 方法类型
    */
    public static MethodType calculateMethodType(Propagation propagation, boolean isTransactionActive, TransactionContext transactionContext) {
       if ((propagation.equals(Propagation.REQUIRED) && !isTransactionActive && transactionContext == null) // Propagation.REQUIRED：支持当前事务，当前没有事务，就新建一个事务。
               || propagation.equals(Propagation.REQUIRES_NEW)) { // Propagation.REQUIRES_NEW：新建事务，如果当前存在事务，把当前事务挂起。
           return MethodType.ROOT;
       } else if ((propagation.equals(Propagation.REQUIRED) // Propagation.REQUIRED：支持当前事务
                   || propagation.equals(Propagation.MANDATORY)) // Propagation.MANDATORY：支持当前事务
               && !isTransactionActive && transactionContext != null) {
           return MethodType.PROVIDER;
       } else {
           return MethodType.NORMAL;
       }
    }
    ```
    * TODO

*     

## 4.3 资源协调者拦截器

## 4.4 

# 666. 彩蛋

