package co.datainsider.bi.repository

import co.datainsider.bi.client.JdbcClient
import co.datainsider.bi.domain.Ids.{DashboardId, DirectoryId, UserId}
import co.datainsider.bi.domain.request.{CreateDirectoryRequest, ListDirectoriesRequest, Sort}
import co.datainsider.bi.domain.{Directory, DirectoryType}
import co.datainsider.bi.util.Using
import com.google.inject.Inject
import com.google.inject.name.Named
import com.twitter.util.Future
import datainsider.client.exception.DbExecuteError

import java.sql.{PreparedStatement, ResultSet}
import scala.collection.mutable.ArrayBuffer

trait DirectoryRepository {
  def get(id: DirectoryId): Future[Option[Directory]]

  def create(request: CreateDirectoryRequest, ownerId: UserId, creatorId: UserId): Future[DirectoryId]

  def list(request: ListDirectoriesRequest): Future[Array[Directory]]

  def list(directoryIds: Array[DirectoryId]): Future[Array[Directory]]

  def count(request: ListDirectoriesRequest): Future[Long]

  def listByDashboardIds(dashboardIds: Array[DashboardId]): Future[Array[Directory]]

  def rename(id: DirectoryId, toName: String): Future[Boolean]

  def move(id: DirectoryId, toParentId: DirectoryId): Future[Boolean]

  def delete(id: DirectoryId): Future[Boolean]

  def remove(id: DirectoryId): Future[Boolean]

  def restore(directory: Directory): Future[Boolean]

  def refreshUpdatedDate(ids: Array[DirectoryId]): Future[Boolean]
}

class MySqlDirectoryRepository @Inject() (
    @Named("mysql") client: JdbcClient,
    dbName: String,
    tblName: String
) extends DirectoryRepository {

  override def get(id: DirectoryId): Future[Option[Directory]] =
    Future {
      client.executeQuery(
        s"""
         |select *
         |from $dbName.$tblName
         |where id = ?;
         |""".stripMargin,
        id
      )(rs => {
        if (rs.next())
          Some(toDirectory(rs))
        else None
      })
    }

  override def create(request: CreateDirectoryRequest, ownerId: UserId, creatorId: UserId): Future[DirectoryId] =
    Future {
      val query =
        s"""
         |insert into $dbName.$tblName
         |(name, creator_id, owner_id, parent_id, dir_type, dashboard_id, updated_date)
         |values(?, ?, ?, ?, ?, ?, ?);
         |""".stripMargin

      client.executeInsert(
        query,
        request.name,
        creatorId,
        ownerId,
        request.parentId,
        request.directoryType.toString,
        request.dashboardId.orNull,
        System.currentTimeMillis()
      )
    }

  override def list(request: ListDirectoriesRequest): Future[Array[Directory]] =
    Future {
      val selectClause = s"select * from $dbName.$tblName"
      val (whereClause, conditionValues): (String, Seq[Any]) = buildWhereClause(request)
      val orderByClause: String = buildOrderBy(request.sorts)
      val limitClause = s"limit ${request.size} offset ${request.from}"

      val query = s"$selectClause $whereClause $orderByClause $limitClause"
      client.executeQuery(query, conditionValues: _*)(toDirectories)
    }

  override def count(request: ListDirectoriesRequest): Future[DashboardId] =
    Future {
      val countClause = s"select count(*) from $dbName.$tblName"
      val (whereClause, conditionValues): (String, Seq[Any]) = buildWhereClause(request)
      val countQuery = s"$countClause $whereClause"
      client.executeQuery(countQuery, conditionValues: _*)(rs => if (rs.next()) rs.getLong(1) else 0)
    }

  private def buildWhereClause(request: ListDirectoriesRequest): (String, Seq[Any]) = {
    val conditionValues = ArrayBuffer.empty[Any]
    var whereClause = "where 1=1"

    request.parentId match {
      case Some(x) =>
        conditionValues += x
        whereClause += " && parent_id = ?"
      case None =>
    }

    request.isRemoved match {
      case Some(x) =>
        conditionValues += x
        whereClause += " && is_removed = ?"
      case None =>
    }

    request.dashboardId match {
      case Some(x) =>
        conditionValues += x
        whereClause += " && dashboard_id = ?"
      case None =>
    }

    request.ownerId match {
      case Some(x) =>
        conditionValues += x
        whereClause += " && owner_id = ?"
      case None =>
    }

    request.directoryType match {
      case Some(x) =>
        conditionValues += x.toString
        whereClause += " && dir_type = ?"
      case None =>
    }

    (whereClause, conditionValues)
  }

  private def buildOrderBy(sorts: Array[Sort]): String = {
    if (sorts.nonEmpty) {
      "order by " + sorts.map(sort => s"${sort.field} ${sort.order.toString}").mkString(", ")
    } else {
      ""
    }
  }

  override def list(directoryIds: Array[DirectoryId]): Future[Array[Directory]] =
    Future {
      if (directoryIds.isEmpty) {
        Array.empty
      } else {
        var query =
          s"select * from $dbName.$tblName where is_removed = FALSE && id in (${Array.fill(directoryIds.length)("?").mkString(",")})"
        client.executeQuery(query, directoryIds: _*)(toDirectories)
      }
    }

  override def rename(id: DirectoryId, toName: String): Future[Boolean] =
    Future {
      client.executeUpdate(
        s"""
         |update $dbName.$tblName
         |set name = ?, updated_date = ?
         |where id = ?;
         |""".stripMargin,
        toName,
        System.currentTimeMillis(),
        id
      ) >= 1
    }

  override def delete(id: DirectoryId): Future[Boolean] =
    Future {
      val query =
        s"""
           |delete from $dbName.$tblName
           |where id = ?;
           |""".stripMargin
      client.executeUpdate(query, id) >= 1
    }

  override def move(id: DirectoryId, toParentId: DirectoryId): Future[Boolean] =
    Future {
      client.executeUpdate(s"""
         |update $dbName.$tblName
         |set parent_id = ?
         |where id = ?;
         |""".stripMargin, toParentId, id) >= 1
    }

  override def remove(id: DirectoryId): Future[Boolean] =
    Future {
      client.executeUpdate(s"""
         |update $dbName.$tblName
         |set is_removed = ?
         |where id = ?;
         |""".stripMargin, true, id) >= 1
    }

  override def restore(directory: Directory): Future[Boolean] =
    Future {
      val query =
        s"""
           |insert into $dbName.$tblName
           |(id, name, creator_id, owner_id, created_date, parent_id, dir_type, dashboard_id, updated_date)
           |values(?, ?, ?, ?, ?, ?, ?, ?, ?);
           |""".stripMargin

      client.executeUpdate(
        query,
        directory.id,
        directory.name,
        directory.creatorId,
        directory.ownerId,
        directory.createdDate,
        directory.parentId,
        directory.directoryType.toString,
        directory.dashboardId.orNull,
        System.currentTimeMillis()
      ) > 0
    }

  private def toDirectory(rs: ResultSet): Directory = {
    val id = rs.getLong("id")
    val name = rs.getString("name")
    val creatorId = rs.getString("creator_id")
    val ownerId = rs.getString("owner_id")
    val createdDate = rs.getLong("created_date")
    val parentId = rs.getLong("parent_id")
    val isRemoved = rs.getBoolean("is_removed")
    val dirType = rs.getString("dir_type")
    val dashboardIdTmp = rs.getLong("dashboard_id")
    val dashboardId = if (rs.wasNull()) None else Some(dashboardIdTmp)
    val updatedDate = rs.getLong("updated_date")
    Directory(
      id,
      name,
      creatorId,
      ownerId,
      createdDate,
      parentId,
      isRemoved,
      DirectoryType.withName(dirType),
      dashboardId,
      Some(updatedDate)
    )
  }

  private def getCreatedId(pstmt: PreparedStatement): DirectoryId = {
    Using(pstmt.getGeneratedKeys) { rs =>
      {
        if (rs.next())
          rs.getLong(1)
        else
          throw DbExecuteError("directory creation fail")
      }
    }
  }

  private def toDirectories(rs: ResultSet): Array[Directory] = {
    val directories = ArrayBuffer[Directory]()
    while (rs.next()) directories += toDirectory(rs)
    directories.toArray
  }

  override def listByDashboardIds(dashboardIds: Array[DashboardId]): Future[Array[Directory]] =
    Future {
      if (dashboardIds.isEmpty) {
        Array.empty
      } else {
        client.executeQuery(
          s"""
          |select *
          |from $dbName.$tblName
          |where is_removed = FALSE && dashboard_id in (${Array.fill(dashboardIds.length)("?").mkString(",")})
          |""".stripMargin,
          dashboardIds: _*
        )(toDirectories)
      }
    }

  override def refreshUpdatedDate(ids: Array[DirectoryId]): Future[Boolean] =
    Future {
      val data: Array[Array[Any]] = ids.map(id => {
        Array(System.currentTimeMillis(), id): Array[Any]
      })
      client.executeBatchUpdate(
        s"""
        |update $dbName.$tblName
        |set updated_date = ?
        |where id = ?
        |""".stripMargin,
        data
      ) >= 1
    }
}
