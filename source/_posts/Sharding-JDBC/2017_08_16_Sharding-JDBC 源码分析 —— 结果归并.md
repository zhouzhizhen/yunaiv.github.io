title: Sharding-JDBC 源码分析 —— 结果归并
date: 2017-08-16
tags:
categories: Sharding-JDBC
permalink: Sharding-JDBC/result-merger

-------

![](https://www.yunai.me/images/common/wechat_mp_2017_07_31.jpg)

> 🙂🙂🙂关注**微信公众号：【芋艿的后端小屋】**有福利：  
> 1. RocketMQ / MyCAT / Sharding-JDBC **所有**源码分析文章列表  
> 2. RocketMQ / MyCAT / Sharding-JDBC **中文注释源码 GitHub 地址**  
> 3. 您对于源码的疑问每条留言**都**将得到**认真**回复。**甚至不知道如何读源码也可以请教噢**。  
> 4. **新的**源码解析文章**实时**收到通知。**每周更新一篇左右**。  
> 5. **认真的**源码交流微信群。

-------

TODO 目录

-------

# 1. 概述

本文分享**查询结果归并**的源码实现。

正如前文[《SQL 执行》](http://www.yunai.me/Sharding-JDBC/sql-execute/?self)提到的**“分表分库，需要执行的 SQL 数量从单条变成了多条”**，多个**SQL执行**结果必然需要进行合并，例如：

``` SQL
SELECT * FROM t_order ORDER BY create_time
```

在各分片排序完后，Sharding-JDBC 获取到结果后，仍然需要再进一步排序。目前有 **分页**、**分组**、**排序**、**AVG聚合计算**、**迭代** 五种场景需要做进一步处理。当然，如果单分片**SQL执行**结果是无需合并的。在[《SQL 执行》](http://www.yunai.me/Sharding-JDBC/sql-execute/?self)不知不觉已经分享了插入、更新、删除操作的结果合并，所以下面我们一起看看**查询结果归并**的实现。

-------

> **Sharding-JDBC 正在收集使用公司名单：[传送门](https://github.com/dangdangdotcom/sharding-jdbc/issues/234)。  
> 🙂 你的登记，会让更多人参与和使用 Sharding-JDBC。[传送门](https://github.com/dangdangdotcom/sharding-jdbc/issues/234)  
> Sharding-JDBC 也会因此，能够覆盖更多的业务场景。[传送门](https://github.com/dangdangdotcom/sharding-jdbc/issues/234)  
> 登记吧，骚年！[传送门](https://github.com/dangdangdotcom/sharding-jdbc/issues/234)**

# 2. MergeEngine

MergeEngine，分片结果集归并引擎。

```Java
// MergeEngine.java
/**
* 数据库类型
*/
private final DatabaseType databaseType;
/**
* 结果集集合
*/
private final List<ResultSet> resultSets;
/**
* Select SQL语句对象
*/
private final SelectStatement selectStatement;
/**
* 查询列名与位置映射
*/
private final Map<String, Integer> columnLabelIndexMap;
    
public MergeEngine(final DatabaseType databaseType, final List<ResultSet> resultSets, final SelectStatement selectStatement) throws SQLException {
   this.databaseType = databaseType;
   this.resultSets = resultSets;
   this.selectStatement = selectStatement;
   // 获得 查询列名与位置映射
   columnLabelIndexMap = getColumnLabelIndexMap(resultSets.get(0));
}

/**
* 获得 查询列名与位置映射
*
* @param resultSet 结果集
* @return 查询列名与位置映射
* @throws SQLException 当结果集已经关闭
*/
private Map<String, Integer> getColumnLabelIndexMap(final ResultSet resultSet) throws SQLException {
   ResultSetMetaData resultSetMetaData = resultSet.getMetaData(); // 元数据（包含查询列信息）
   Map<String, Integer> result = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
   for (int i = 1; i <= resultSetMetaData.getColumnCount(); i++) {
       result.put(SQLUtil.getExactlyValue(resultSetMetaData.getColumnLabel(i)), i);
   }
   return result;
}
```

* 当 MergeEngine 被创建时，会传入 `resultSets` 结果集集合，并根据其获得 `columnLabelIndexMap` 查询列名与位置映射。通过 `columnLabelIndexMap`，可以很方便的使用查询列名获得在返回结果记录列( header )的第几列。

-------

MergeEngine 的 `#merge()` 方法作为入口提供**查询结果归并**功能。

```Java
/**
* 合并结果集.
*
* @return 归并完毕后的结果集
* @throws SQLException SQL异常
*/
public ResultSetMerger merge() throws SQLException {
   selectStatement.setIndexForItems(columnLabelIndexMap);
   return decorate(build());
}
```

* `#merge()` 主体逻辑就两行代码，设置查询列位置信息，并返回**合适**的归并结果集接口( ResultSetMerger ) 实现。

## 2.1 SelectStatement#setIndexForItems()

```Java
// SelectStatement.java
/**
* 为选择项设置索引.
* 
* @param columnLabelIndexMap 列标签索引字典
*/
public void setIndexForItems(final Map<String, Integer> columnLabelIndexMap) {
   setIndexForAggregationItem(columnLabelIndexMap);
   setIndexForOrderItem(columnLabelIndexMap, orderByItems);
   setIndexForOrderItem(columnLabelIndexMap, groupByItems);
}
```

* 部分**查询列**是经过**推到**出来，在 **SQL解析** 过程中，未获得到查询列位置，需要通过该方法进行初始化。对这块不了解的同学，回头可以看下[《SQL 解析（三）之查询SQL》](http://www.yunai.me/Sharding-JDBC/sql-parse-3/?self)。🙂 现在不用回头，皇冠会掉。
* `#setIndexForAggregationItem()` 处理 **AVG聚合计算列** 推导出其对应的 **SUM/COUNT 聚合计算列**的位置：

    ```Java
    private void setIndexForAggregationItem(final Map<String, Integer> columnLabelIndexMap) {
       for (AggregationSelectItem each : getAggregationSelectItems()) {
           Preconditions.checkState(columnLabelIndexMap.containsKey(each.getColumnLabel()), String.format("Can't find index: %s, please add alias for aggregate selections", each));
           each.setIndex(columnLabelIndexMap.get(each.getColumnLabel()));
           for (AggregationSelectItem derived : each.getDerivedAggregationSelectItems()) {
               Preconditions.checkState(columnLabelIndexMap.containsKey(derived.getColumnLabel()), String.format("Can't find index: %s", derived));
               derived.setIndex(columnLabelIndexMap.get(derived.getColumnLabel()));
           }
       }
    }
    ```

* `#setIndexForOrderItem()` 处理 **ORDER BY / GROUP BY 列不在查询列** 推导出的**查询列**的位置：
 
    ```Java
    private void setIndexForOrderItem(final Map<String, Integer> columnLabelIndexMap, final List<OrderItem> orderItems) {
    for (OrderItem each : orderItems) {
      if (-1 != each.getIndex()) {
          continue;
      }
      Preconditions.checkState(columnLabelIndexMap.containsKey(each.getColumnLabel()), String.format("Can't find index: %s", each));
      if (columnLabelIndexMap.containsKey(each.getColumnLabel())) {
          each.setIndex(columnLabelIndexMap.get(each.getColumnLabel()));
      }
    }
    }
    ```

## 2.2 ResultSetMerger

AbstractStreamResultSetMerger：next时加载
AbstractMemoryResultSetMerger：加载完所有记录

# 3. Order By

# 4. Group By

# 5. Limit

# 666. 彩蛋


-------


