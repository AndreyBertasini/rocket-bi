package co.datainsider.bi.domain.query

import co.datainsider.bi.domain.query.JoinType.JoinType
import co.datainsider.bi.engine.SqlParser
import datainsider.client.exception.BadRequestError

import scala.collection.mutable
import scala.collection.mutable.ArrayBuffer

/**
  * E.g: FromField("sale_db.data a", "a")
  *      FromField("(select * from some_table) t", "t")
  * @param sqlStr sql part after 'from', E.g from <sqlView> join <sqlView> on ...
  * @param viewName identifier to know which view is which
  */
case class FromField(sqlStr: String, viewName: String)

/**
  * E.g: (viewA.id = viewB.userId)
  * @param leftViewName view name on the left side
  * @param rightViewName view name on the right side
  * @param conditionStr condition in sql syntax, sql part after 'on'
  */
case class JoinField(joinType: JoinType, leftViewName: String, rightViewName: String, conditionStr: String)

object JoinType extends Enumeration {
  type JoinType = Value
  val Left: JoinType = Value("left")
  val Right: JoinType = Value("right")
  val Inner: JoinType = Value("inner")
}

/*
 * construct actual sql to be executed by sql engine
 * fields (in select, where, group by, having, order by clauses) are separated by comma -> arr.mkString(",")
 * views (in from clause) are separated by join clause -> viewA join viewB on (viewA.id = viewB.userId)
 */
class SqlBuilder(sqlParser: SqlParser) {

  val selectFields: ArrayBuffer[String] = ArrayBuffer[String]()
  val aggregateFields: ArrayBuffer[String] = ArrayBuffer[String]()
  val fromFields: mutable.Set[FromField] = mutable.Set[FromField]()
  val joinFields: ArrayBuffer[JoinField] = ArrayBuffer[JoinField]()
  val whereFields: ArrayBuffer[String] = ArrayBuffer[String]()
  val groupByFields: ArrayBuffer[String] = ArrayBuffer[String]()
  val havingFields: ArrayBuffer[String] = ArrayBuffer[String]()
  val orderByFields: ArrayBuffer[String] = ArrayBuffer[String]()
  var isGroupBy: Boolean = false
  var isDistinct: Boolean = false
  var isLimit: Boolean = false
  var limitSize: Int = 10000
  var limitOffset: Int = 0

  def addFunction(function: Function): Unit = {
    function match {
      case f: Select =>
        selectFields += sqlParser.selectWithAliasName(f)
        groupByFields += sqlParser.toAliasName(f)
      case f: SelectDistinct =>
        selectFields += sqlParser.selectWithAliasName(f)
        isDistinct = true
      case f: GroupBy =>
        selectFields += sqlParser.selectWithAliasName(f)
        groupByFields += sqlParser.toAliasName(f)
        isGroupBy = true

      case f: Count =>
        aggregateFields += sqlParser.selectWithAliasName(f)
      case f: CountDistinct =>
        aggregateFields += sqlParser.selectWithAliasName(f)
      case f: Avg =>
        aggregateFields += sqlParser.selectWithAliasName(f)
      case f: Min =>
        aggregateFields += sqlParser.selectWithAliasName(f)
      case f: Max =>
        aggregateFields += sqlParser.selectWithAliasName(f)
      case f: Sum =>
        aggregateFields += sqlParser.selectWithAliasName(f)
      case f: First =>
        aggregateFields += sqlParser.selectWithAliasName(f)
      case f: Last =>
        aggregateFields += sqlParser.selectWithAliasName(f)
      case f: SelectExpression =>
        aggregateFields += sqlParser.selectWithAliasName(f)

      case f: SelectAll =>
        selectFields += "*"
      case f: SelectNull =>
        selectFields += sqlParser.selectWithAliasName(f)
      case f: CountAll =>
        selectFields += sqlParser.selectWithAliasName(f)
      case f: SelectExpr =>
        selectFields += sqlParser.selectWithAliasName(f)

      case f: DynamicFunction =>
        addFunction(f.finalFunction.getOrElse(f.baseFunction))

    }
  }

  def addCondition(condition: Condition): Unit = {
    condition match {
      case And(conditions) =>
        val conditionStrings = conditions.map(sqlParser.toQueryString).filter(_.nonEmpty)
        if (conditionStrings.nonEmpty) whereFields += conditionStrings.mkString("(", " and ", ")")
      case Or(conditions) =>
        val conditionStrings = conditions.map(sqlParser.toQueryString).filter(_.nonEmpty)
        if (conditionStrings.nonEmpty) whereFields += conditionStrings.mkString("(", " or ", ")")
      case DynamicCondition(_, baseCondition, finalCondition) =>
        val conditionStr = finalCondition.map(sqlParser.toQueryString).filter(_.nonEmpty)
        if (conditionStr.isDefined) {
          whereFields += conditionStr.get
        }
      case _ =>
        whereFields += sqlParser.toQueryString(condition)
    }
  }

  def addAggregateCondition(aggregateCondition: AggregateCondition): Unit = {
    val havingStr = sqlParser.toQueryString(aggregateCondition)
    if (havingStr.nonEmpty) havingFields += havingStr
  }

  def addOrder(orderBy: OrderBy): Unit = {
    val functionAliasName: String = sqlParser.toAliasName(orderBy.function)

    val orderByField: String =
      if ((selectFields ++ aggregateFields).exists(_.contains(functionAliasName))) functionAliasName
      else sqlParser.toQueryString(orderBy.function)

    val orderByStr = s"$orderByField ${orderBy.order.toString}"
    orderByFields += orderByStr

    if (orderBy.numElemsShown.isDefined) {
      setLimit(Some(Limit(0, orderBy.numElemsShown.get)))
    }
  }

  def setLimit(limit: Option[Limit]): Unit = {
    limit match {
      case Some(x) =>
        isLimit = true
        limitOffset = x.offset
        limitSize = x.size
      case None =>
    }
  }

  def addFrom(fromField: FromField): Unit = {
    fromFields += fromField
  }

  def addJoin(joinField: JoinField): Unit = {
    joinFields += joinField
  }

  def build(): String = {
    val selectClause: String = selectFields.union(aggregateFields).mkString(", ")
    val fromClause: String = buildFromClause()
    val whereClause: String =
      if (whereFields.isEmpty) ""
      else whereFields.mkString("(", ") and (", ")")
    val groupByClause: String = groupByFields.mkString(", ")
    val havingClause: String =
      if (havingFields.isEmpty) ""
      else havingFields.mkString("(", ") and (", ")")
    val orderByClause: String = orderByFields.mkString(", ")
    val limitClause: String = s"$limitOffset, $limitSize"

    s"""
       |${if (isDistinct) s"select distinct $selectClause" else s"select $selectClause"}
       |${if (fromClause.isEmpty) "" else s"from $fromClause"}
       |${if (whereClause.isEmpty) "" else s"where ($whereClause)"}
       |${if (!isGroupBy) "" else s"group by $groupByClause"}
       |${if (havingClause.isEmpty) "" else s"having $havingClause"}
       |${if (orderByClause.isEmpty) "" else s"order by $orderByClause"}
       |${if (!isLimit) "" else s"limit $limitClause"}
       |""".stripMargin
  }

  /** *
    * connect multiple tables using join clause, tables are joined using equal expressions
    * @return tblA join tblB on (tblA.id == tblB.some_id) join ...
    */
  private def buildFromClause(): String = {
    if (joinFields.nonEmpty) {
      var curView = getSqlView(joinFields(0).leftViewName) // init
      val knownViews = mutable.Set[String](joinFields(0).leftViewName)

      joinFields.foreach(join => {
        var notChanged = true

        if (!knownViews.contains(join.leftViewName)) {
          curView += s"\n  ${join.joinType.toString} join ${getSqlView(join.leftViewName)} on ${join.conditionStr}"
          knownViews += join.leftViewName
          notChanged = false
        } else if (!knownViews.contains(join.rightViewName)) {
          curView += s"\n  ${join.joinType.toString} join ${getSqlView(join.rightViewName)} on ${join.conditionStr}"
          knownViews += join.rightViewName
          notChanged = false
        }

        if (notChanged) throw BadRequestError("invalid join clause")
      })

      curView

    } else {
      if (fromFields.size > 1) {
        throw BadRequestError(s"not enough table relationship to link ${fromFields.map(_.sqlStr).mkString(", ")}")
      }
      fromFields.head.sqlStr
    }
  }

  private def getSqlView(viewName: String): String = {
    fromFields.find(from => from.viewName == viewName) match {
      case Some(from) => from.sqlStr
      case None       => throw BadRequestError(s"can not find view with name $viewName")
    }
  }

}
