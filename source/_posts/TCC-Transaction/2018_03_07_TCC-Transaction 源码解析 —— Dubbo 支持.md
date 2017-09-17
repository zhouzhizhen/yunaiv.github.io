title: TCC-Transaction 源码分析 —— Dubbo 支持
date: 2018-02-28
tags:
categories: TCC-Transaction
permalink: TCC-Transaction/dubbo-support

---

# 1. 概述

本文分享 **Dubbo 支持**。TCC-Transaction 通过 Dubbo 支持隐式传参的功能，避免自己对业务代码的入侵。可能有同学不太理解为什么说 TCC-Transaction 对业务代码有一定的入侵性，一起来看个代码例子：

```Java
public interface CapitalTradeOrderService {
    String record(TransactionContext transactionContext, CapitalTradeOrderDto tradeOrderDto);
}
```
* 代码来自 `tcc-transaction-http-sample` 。声明远程调用时，增加了参数 TransactionContext。当然你也可以通过自己使用的远程调用框架做一定封装，避免入侵。

如下是对 Dubbo 封装了后，远程调用接口的声明

```Java
public interface CapitalTradeOrderService {

    @Compensable
    String record(CapitalTradeOrderDto tradeOrderDto);

}
```

* 代码来自 `http-transaction-dubbo-sample` 。是不是不需要传入参数 TransactionContext。当然，注解是肯定需要的，否则 TCC-Transaction 怎么知道哪些方法是 TCC 方法。

Dubbo 支持( Maven 项目 `tcc-transaction-dubbo` ) 整体代码结构如下：

![](http://www.iocoder.cn/images/TCC-Transaction/2018_03_07/01.png)

* `proxy`
* `context`

我们分成两个小节分享这两个包实现的功能。

**笔者暂时对 Dubbo 了解的不够深入，如果有错误的地方，还烦请指出，谢谢。**

> 你行好事会因为得到赞赏而愉悦  
> 同理，开源项目贡献者会因为 Star 而更加有动力  
> 为 TCC-Transaction 点赞！[传送门](https://github.com/changmingxie/tcc-transaction)

ps：笔者假设你已经阅读过[《tcc-transaction 官方文档 —— 使用指南1.2.x》](https://github.com/changmingxie/tcc-transaction/wiki/%E4%BD%BF%E7%94%A8%E6%8C%87%E5%8D%971.2.x)。

# 2. 代理



# 3. 上下文

