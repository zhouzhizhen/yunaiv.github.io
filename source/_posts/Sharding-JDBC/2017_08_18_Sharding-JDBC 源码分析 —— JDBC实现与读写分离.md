title: Sharding-JDBC 源码分析 —— JDBC 实现
date: 2017-08-18
tags:
categories: Sharding-JDBC
permalink: Sharding-JDBC/jdbc-implement-and-read-write-splitting

-------

![](https://www.yunai.me/images/common/wechat_mp_2017_07_31.jpg)

> 🙂🙂🙂关注**微信公众号：【芋艿的后端小屋】**有福利：  
> 1. RocketMQ / MyCAT / Sharding-JDBC **所有**源码分析文章列表  
> 2. RocketMQ / MyCAT / Sharding-JDBC **中文注释源码 GitHub 地址**  
> 3. 您对于源码的疑问每条留言**都**将得到**认真**回复。**甚至不知道如何读源码也可以请教噢**。  
> 4. **新的**源码解析文章**实时**收到通知。**每周更新一篇左右**。  
> 5. **认真的**源码交流微信群。

-------

占坑文。关注公众号，第一时间获得更新通知。

-------

# 1. 概述

本文主要分享 **JDBC** 与 **读写分离** 的实现。为什么会把这两个东西放在一起讲呢？客户端直连数据库的读写分离主要通过获取读库和写库的不同连接来实现。

OK，我们先来看一段 Sharding-JDBC 官方对自己的定义和定位

> Sharding-JDBC定位为轻量级java框架，使用客户端直连数据库，以jar包形式提供服务，未使用中间层，无需额外部署，无其他依赖，DBA也无需改变原有的运维方式，可理解为**增强版的JDBC驱动**，旧代码迁移成本几乎为零。

可以看出，Sharding-JDBC 通过实现 **JDBC规范**，对上层提供透明化数据库分库分表的访问。😈 黑科技？实际我们使用的**数据库连接池**也是通过这种方式实现对上层无感知的使用连接池。甚至还可以通过这种方式实现对 Lucene、[MongoDB](http://www.yunai.me/MyCAT/connect-mongodb/?self) 等的访问。

扯远了，下面来看看 Sharding-JDBC `jdbc` 包的结构：

![](../../../images/Sharding-JDBC/2017_08_18/01.png)

* `unsupported`：声明**不支持**的数据操作方法
* `adapter`：适配类，实现和分库分表**无关**的方法
* `core`：核心类，实现和分库分表**相关**的方法

根据 `core` 包，可以看出分成四种我们**超级熟悉**的四种对象  

* Datasource

    ![-w640](../../../images/Sharding-JDBC/2017_08_18/02.png)

* Connection

   ![-w640](../../../images/Sharding-JDBC/2017_08_18/03.png)

* Statement

  ![-w640](../../../images/Sharding-JDBC/2017_08_18/04.png)

* ResultSet

  ![-w640](../../../images/Sharding-JDBC/2017_08_18/05.png)

**实现**层级如下：**JDBC 接口** <=(继承)== **`unsupported`抽象类** <=(继承)== **`unsupported`抽象类** <=(继承)== **`core`类**。

-------

**本文内容顺序**

1. `unspported` 包
2. `adapter` 包
3. 插入流程，贯穿 JDBC 实现。涉及到的类：
    * ShardingDataSource
    * ShardingConnection
    * ShardingPreparedStatement（ShardingStatement 类似，不重复分析）
    * GeneratedKeysResultSet、GeneratedKeysResultSetMetaData、ShardingResultSet
4. 读写分离，主要 ShardingDataSource 类

-------

> **Sharding-JDBC 正在收集使用公司名单：[传送门](https://github.com/dangdangdotcom/sharding-jdbc/issues/234)。  
> 🙂 你的登记，会让更多人参与和使用 Sharding-JDBC。[传送门](https://github.com/dangdangdotcom/sharding-jdbc/issues/234)  
> Sharding-JDBC 也会因此，能够覆盖更多的业务场景。[传送门](https://github.com/dangdangdotcom/sharding-jdbc/issues/234)  
> 登记吧，骚年！[传送门](https://github.com/dangdangdotcom/sharding-jdbc/issues/234)**

# 2. unspported 包

`unspported` 包内的**抽象**类，声明不支持操作的数据对象，所有方法都是 `throw new SQLFeatureNotSupportedException()` 方式。

```Java
public abstract class AbstractUnsupportedGeneratedKeysResultSet extends AbstractUnsupportedOperationResultSet {
    
    @Override
    public boolean getBoolean(final int columnIndex) throws SQLException {
        throw new SQLFeatureNotSupportedException("getBoolean");
    }
    
    // .... 省略其它类似方法
}

public abstract class AbstractUnsupportedOperationConnection extends WrapperAdapter implements Connection {
    
    @Override
    public final CallableStatement prepareCall(final String sql) throws SQLException {
        throw new SQLFeatureNotSupportedException("prepareCall");
    }
    
   // .... 省略其它类似方法
}
```

# 3. adapter 包

`adapter` 包内的**抽象**类，实现和分库分表**无关**的方法。

**考虑到第4、5两小节更容易理解，本小节贴的代码会相对多**

## 3.1 WrapperAdapter

[WrapperAdapter](https://github.com/dangdangdotcom/sharding-jdbc/blob/d6ac50704f5e45beeeded09a4f0b160c7320b993/sharding-jdbc-core/src/main/java/com/dangdang/ddframe/rdb/sharding/jdbc/adapter/WrapperAdapter.java)，JDBC Wrapper 适配类。

**对 Wrapper 接口实现如下两个方法**：

```Java
@Override
public final <T> T unwrap(final Class<T> iface) throws SQLException {
   if (isWrapperFor(iface)) {
       return (T) this;
   }
   throw new SQLException(String.format("[%s] cannot be unwrapped as [%s]", getClass().getName(), iface.getName()));
}
    
@Override
public final boolean isWrapperFor(final Class<?> iface) throws SQLException {
   return iface.isInstance(this);
}
```

**提供子类 `#recordMethodInvocation()` 记录方法调用，`#replayMethodsInvocation()` 回放记录的方法调用**：

```Java

/**
* 记录的方法数组
*/
private final Collection<JdbcMethodInvocation> jdbcMethodInvocations = new ArrayList<>();

/**
* 记录方法调用.
* 
* @param targetClass 目标类
* @param methodName 方法名称
* @param argumentTypes 参数类型
* @param arguments 参数
*/
public final void recordMethodInvocation(final Class<?> targetClass, final String methodName, final Class<?>[] argumentTypes, final Object[] arguments) {
   try {
       jdbcMethodInvocations.add(new JdbcMethodInvocation(targetClass.getMethod(methodName, argumentTypes), arguments));
   } catch (final NoSuchMethodException ex) {
       throw new ShardingJdbcException(ex);
   }
}
    
/**
* 回放记录的方法调用.
* 
* @param target 目标对象
*/
public final void replayMethodsInvocation(final Object target) {
   for (JdbcMethodInvocation each : jdbcMethodInvocations) {
       each.invoke(target);
   }
}
```

* 这两个方法有什么用途呢？例如下文会提到的 AbstractConnectionAdapter 的 `#setAutoCommit()`，当它无数据库连接时，先记录；等到那到数据连接后，再回放：

    ```Java
    // AbstractConnectionAdapter.java
    @Override
    public final void setAutoCommit(final boolean autoCommit) throws SQLException {
       this.autoCommit = autoCommit;
       if (getConnections().isEmpty()) { // 无数据连接时，记录方法调用
           recordMethodInvocation(Connection.class, "setAutoCommit", new Class[] {boolean.class}, new Object[] {autoCommit});
           return;
       }
       for (Connection each : getConnections()) {
           each.setAutoCommit(autoCommit);
       }
    }
    ```
* JdbcMethodInvocation，反射调用JDBC相关方法的工具类：

    ```Java
    public class JdbcMethodInvocation {
    
        /**
         * 方法
         */
        @Getter
        private final Method method;
        /**
         * 方法参数
         */
        @Getter
        private final Object[] arguments;
        
        /**
         *  调用方法.
         * 
         * @param target 目标对象
         */
        public void invoke(final Object target) {
            try {
                method.invoke(target, arguments); // 反射调用
            } catch (final IllegalAccessException | InvocationTargetException ex) {
                throw new ShardingJdbcException("Invoke jdbc method exception", ex);
            }
        }
    }
    ```    

**提供子类 `#throwSQLExceptionIfNecessary()` 抛出异常链**：

```Java
protected void throwSQLExceptionIfNecessary(final Collection<SQLException> exceptions) throws SQLException {
   if (exceptions.isEmpty()) { // 为空不抛出异常
       return;
   }
   SQLException ex = new SQLException();
   for (SQLException each : exceptions) {
       ex.setNextException(each); // 异常链
   }
   throw ex;
}
```

## 3.2 AbstractDataSourceAdapter

[AbstractDataSourceAdapter](https://github.com/dangdangdotcom/sharding-jdbc/blob/d6ac50704f5e45beeeded09a4f0b160c7320b993/sharding-jdbc-core/src/main/java/com/dangdang/ddframe/rdb/sharding/jdbc/adapter/AbstractDataSourceAdapter.java)，数据源适配类。

直接点击链接查看源码。

## 3.3 AbstractConnectionAdapter

[AbstractConnectionAdapter](https://github.com/dangdangdotcom/sharding-jdbc/blob/d6ac50704f5e45beeeded09a4f0b160c7320b993/sharding-jdbc-core/src/main/java/com/dangdang/ddframe/rdb/sharding/jdbc/adapter/AbstractConnectionAdapter.java)，数据库连接适配类。

我们来瞅瞅大家最关心的**事务**相关方法的实现。

```Java
/**
* 是否自动提交
*/
private boolean autoCommit = true;

/**
* 获得链接
*
* @return 链接
*/
protected abstract Collection<Connection> getConnections();
    
@Override
public final boolean getAutoCommit() throws SQLException {
   return autoCommit;
}
    
@Override
public final void setAutoCommit(final boolean autoCommit) throws SQLException {
   this.autoCommit = autoCommit;
   if (getConnections().isEmpty()) { // 无数据连接时，记录方法调用
       recordMethodInvocation(Connection.class, "setAutoCommit", new Class[] {boolean.class}, new Object[] {autoCommit});
       return;
   }
   for (Connection each : getConnections()) {
       each.setAutoCommit(autoCommit);
   }
}
```

* `#setAutoCommit()` 调用时，实际会设置其所持有的 Connection 的 `autoCommit` 属性
* `#getConnections()` 和分库分表相关，因而仅抽象该方法，留给子类实现

```Java
@Override
public final void commit() throws SQLException {
   for (Connection each : getConnections()) {
       each.commit();
   }
}
    
@Override
public final void rollback() throws SQLException {
   Collection<SQLException> exceptions = new LinkedList<>();
   for (Connection each : getConnections()) {
       try {
           each.rollback();
       } catch (final SQLException ex) {
           exceptions.add(ex);
       }
   }
   throwSQLExceptionIfNecessary(exceptions);
}
```

* `#commit()`、`#rollback()` 调用时，实际调用其所持有的 Connection 的方法
* 异常情况下，`#commit()` 和 `#rollback()` 处理方式不同，笔者暂时不知道答案，求证后会进行更新 

```Java
/**
* 只读
*/
private boolean readOnly = true;
/**
* 事务级别
*/
private int transactionIsolation = TRANSACTION_READ_UNCOMMITTED;

@Override
public final void setReadOnly(final boolean readOnly) throws SQLException {
   this.readOnly = readOnly;
   if (getConnections().isEmpty()) {
       recordMethodInvocation(Connection.class, "setReadOnly", new Class[] {boolean.class}, new Object[] {readOnly});
       return;
   }
   for (Connection each : getConnections()) {
       each.setReadOnly(readOnly);
   }
}
    
@Override
public final void setTransactionIsolation(final int level) throws SQLException {
   transactionIsolation = level;
   if (getConnections().isEmpty()) {
       recordMethodInvocation(Connection.class, "setTransactionIsolation", new Class[] {int.class}, new Object[] {level});
       return;
   }
   for (Connection each : getConnections()) {
       each.setTransactionIsolation(level);
   }
}
```

## 3.4 AbstractStatementAdapter

[AbstractStatementAdapter](https://github.com/dangdangdotcom/sharding-jdbc/blob/d6ac50704f5e45beeeded09a4f0b160c7320b993/sharding-jdbc-core/src/main/java/com/dangdang/ddframe/rdb/sharding/jdbc/adapter/AbstractStatementAdapter.java)，静态语句对象适配类。

```Java
@Override
public final int getUpdateCount() throws SQLException {
   long result = 0;
   boolean hasResult = false;
   for (Statement each : getRoutedStatements()) {
       if (each.getUpdateCount() > -1) {
           hasResult = true;
       }
       result += each.getUpdateCount();
   }
   if (result > Integer.MAX_VALUE) {
       result = Integer.MAX_VALUE;
   }
   return hasResult ? Long.valueOf(result).intValue() : -1;
}

/**
* 获取路由的静态语句对象集合.
* 
* @return 路由的静态语句对象集合
*/
protected abstract Collection<? extends Statement> getRoutedStatements();
```

* `#getUpdateCount()` 调用持有的 Statement 计算更新数量
* `#getRoutedStatements()` 和分库分表相关，因而仅抽象该方法，留给子类实现

## 3.5 AbstractPreparedStatementAdapter

[AbstractPreparedStatementAdapter](https://github.com/dangdangdotcom/sharding-jdbc/blob/d6ac50704f5e45beeeded09a4f0b160c7320b993/sharding-jdbc-core/src/main/java/com/dangdang/ddframe/rdb/sharding/jdbc/adapter/AbstractPreparedStatementAdapter.java)，预编译语句对象的适配类。

**`#recordSetParameter()`实现对占位符参数的设置**：

```Java
/**
* 记录的设置参数方法数组
*/
private final List<SetParameterMethodInvocation> setParameterMethodInvocations = new LinkedList<>();
/**
* 参数
*/
@Getter
private final List<Object> parameters = new ArrayList<>();

@Override
public final void setInt(final int parameterIndex, final int x) throws SQLException {
   setParameter(parameterIndex, x);
   recordSetParameter("setInt", new Class[]{int.class, int.class}, parameterIndex, x);
}

/**
* 记录占位符参数
*
* @param parameterIndex 占位符参数位置
* @param value 参数
*/
private void setParameter(final int parameterIndex, final Object value) {
   if (parameters.size() == parameterIndex - 1) {
       parameters.add(value);
       return;
   }
   for (int i = parameters.size(); i <= parameterIndex - 1; i++) { // 用 null 填充前面未设置的位置
       parameters.add(null);
   }
   parameters.set(parameterIndex - 1, value);
}

/**
* 记录设置参数方法调用
*
* @param methodName 方法名，例如 setInt、setLong 等
* @param argumentTypes 参数类型
* @param arguments 参数
*/
private void recordSetParameter(final String methodName, final Class[] argumentTypes, final Object... arguments) {
   try {
       setParameterMethodInvocations.add(new SetParameterMethodInvocation(PreparedStatement.class.getMethod(methodName, argumentTypes), arguments, arguments[1]));
   } catch (final NoSuchMethodException ex) {
       throw new ShardingJdbcException(ex);
   }
}

/**
* 回放记录的设置参数方法调用
*
* @param preparedStatement 预编译语句对象
*/
protected void replaySetParameter(final PreparedStatement preparedStatement) {
   addParameters();
   for (SetParameterMethodInvocation each : setParameterMethodInvocations) {
       updateParameterValues(each, parameters.get(each.getIndex() - 1)); // 同一个位置多次设置，值可能不一样，需要更新下
       each.invoke(preparedStatement);
   }
}

/**
* 当使用分布式主键时，生成后会添加到 parameters，此时 parameters 数量多于 setParameterMethodInvocations，需要生成该分布式主键的 SetParameterMethodInvocation
*/
private void addParameters() {
   for (int i = setParameterMethodInvocations.size(); i < parameters.size(); i++) {
       recordSetParameter("setObject", new Class[]{int.class, Object.class}, i + 1, parameters.get(i));
   }
}
    
private void updateParameterValues(final SetParameterMethodInvocation setParameterMethodInvocation, final Object value) {
   if (!Objects.equals(setParameterMethodInvocation.getValue(), value)) {
       setParameterMethodInvocation.changeValueArgument(value); // 修改占位符参数
   }
}
```

* 逻辑类似 `WrapperAdapter` 的 `#recordMethodInvocation()`，`#replayMethodsInvocation()`，请**认真**阅读代码注释

* SetParameterMethodInvocation，继承 JdbcMethodInvocation，反射调用参数设置方法的工具类：

    ```Java
    public final class SetParameterMethodInvocation extends JdbcMethodInvocation {
    
        /**
         * 位置
         */
        @Getter
        private final int index;
        /**
         * 参数值
         */
        @Getter
        private final Object value;
        
        /**
         * 设置参数值.
         * 
         * @param value 参数值
         */
        public void changeValueArgument(final Object value) {
            getArguments()[1] = value;
        }
    }
    ```

## 3.6 AbstractResultSetAdapter

[AbstractResultSetAdapter](https://github.com/dangdangdotcom/sharding-jdbc/blob/d6ac50704f5e45beeeded09a4f0b160c7320b993/sharding-jdbc-core/src/main/java/com/dangdang/ddframe/rdb/sharding/jdbc/adapter/AbstractResultSetAdapter.java)，代理结果集适配器。

```Java
public abstract class AbstractResultSetAdapter extends AbstractUnsupportedOperationResultSet {
    /**
     * 结果集集合
     */
    @Getter
    private final List<ResultSet> resultSets;
    
    @Override
    // TODO should return sharding statement in future
    public final Statement getStatement() throws SQLException {
        return getResultSets().get(0).getStatement();
    }
    
    @Override
    public final ResultSetMetaData getMetaData() throws SQLException {
        return getResultSets().get(0).getMetaData();
    }
    
    @Override
    public int findColumn(final String columnLabel) throws SQLException {
        return getResultSets().get(0).findColumn(columnLabel);
    }
    
    // .... 省略其它方法
}
```

# 4. 插入流程

# 5. 读写分离


