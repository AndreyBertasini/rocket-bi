package datainsider.schema.module

import com.google.inject.Provides
import com.twitter.inject.TwitterModule
import datainsider.client.service.{MockOrgAuthorizationClientServiceImpl, MockProfileClientServiceImpl, OrgAuthorizationClientService, ProfileClientService}
import datainsider.client.util.{JdbcClient, NativeJdbcClient, ZConfig}
import datainsider.schema.domain.CsvUploadInfo
import datainsider.schema.misc._
import datainsider.schema.repository._
import datainsider.schema.service._
import education.x.commons.{I32IdGenerator, SsdbKVS}
import org.nutz.ssdb4j.SSDBs
import org.nutz.ssdb4j.spi.SSDB
import org.testcontainers.containers.DockerComposeContainer

import java.io.File
import javax.inject.Singleton
import scala.concurrent.{ExecutionContext, ExecutionContextExecutor}

object TestModule extends TwitterModule {

  val dockerContainer = new DockerComposeContainer(
    new File(getClass.getClassLoader.getResource("docker/docker-compose.yml").getFile)
  )
  val clickhouseServiceName: String = ZConfig.getString("test_db.clickhouse.service_name")
  val clickhouseHttpInterfacePort: Int = ZConfig.getInt("test_db.clickhouse.http_interface_port")
  val clickhouseNativeInterfacePort: Int = ZConfig.getInt("test_db.clickhouse.native_interface_port")
  val ssdbServiceName: String = ZConfig.getString("test_db.ssdb.service_name")
  val ssdbServicePort: Int = ZConfig.getInt("test_db.ssdb.port")
  val mysqlServiceName: String = ZConfig.getString("test_db.mysql.service_name")
  val mysqlServicePort: Int = ZConfig.getInt("test_db.mysql.port")

  override def configure(): Unit = {
    super.configure()

    bind[String].annotatedWithName("admin_secret_key").toInstance(ZConfig.getString("admin_secret_key"))
    bind[String].annotatedWithName("service_key").toInstance(ZConfig.getString("service_key"))
    bind[ShareService].to[ShareServiceImpl].asEagerSingleton()
    bind[OrgAuthorizationClientService].to[MockOrgAuthorizationClientServiceImpl].asEagerSingleton()
    bind[ProfileClientService].to[MockProfileClientServiceImpl].asEagerSingleton()
    bind[FileSyncInfoService].to[MockFileSyncInfoService].asEagerSingleton()
    bind[FileSyncHistoryService].to[MockFileSyncHistoryService].asEagerSingleton()
    bind[OldCsvUploadService].to[OldCsvUploadServiceImpl].asEagerSingleton()
    bind[CsvIngestionService].to[CsvIngestionServiceImpl].asEagerSingleton()
  }
  dockerContainer.withExposedService(clickhouseServiceName, clickhouseHttpInterfacePort)
  dockerContainer.withExposedService(clickhouseServiceName, clickhouseNativeInterfacePort)
  dockerContainer.withExposedService(ssdbServiceName, ssdbServicePort)
  dockerContainer.withExposedService(mysqlServiceName, mysqlServicePort)
  dockerContainer.start()

  ensureMysqlSchema()

  @Singleton
  @Provides
  def providesSSDB(): SSDB = {
    SSDBs.pool(
      ZConfig.getString("db.ssdb.host"),
      ZConfig.getInt("db.ssdb.port"),
      ZConfig.getInt("db.ssdb.timeout_in_ms"),
      null
    )
//    SSDBs.pool("localhost", 8888, 100, null)
  }

  @Singleton
  @Provides
  def providesClickHouseClient(): JdbcClient = {
    val driverClass: String = ZConfig.getString("db.clickhouse.driver_class")
    val jdbcUrl: String = ZConfig.getString("db.clickhouse.url")
    val user: String = ZConfig.getString("db.clickhouse.user")
    val password: String = ZConfig.getString("db.clickhouse.password")

    info(s"""
         |Clickhouse datasource:
         |Driver: $driverClass
         |URL: $jdbcUrl
         |User: $user
         |Password: $password
         |""".stripMargin)

    NativeJdbcClient(jdbcUrl, user, password)
//    NativeJdbcClient("localhost", "default", "")
  }

  @Singleton
  @Provides
  def provideShareRepository(ssdb: SSDB): ShareRepository = {
    val dbName: String = ZConfig.getString("test_db.mysql.dbname")
    val host: String = ZConfig.getString("test_db.mysql.host")
    val port = ZConfig.getInt("test_db.mysql.port")
    val username: String = ZConfig.getString("test_db.mysql.username")
    val password: String = ZConfig.getString("test_db.mysql.password")
    val generator = I32IdGenerator("share_service", "id", ssdb)
    val client = NativeJdbcClient(
      s"jdbc:mysql://$host:$port/$dbName?useLegacyDatetimeCode=false&serverTimezone=Asia/Ho_Chi_Minh",
      username,
      password
    )
    MySqlShareRepository(
      client,
      ZConfig.getString("test_db.mysql.dbname"),
      ZConfig.getString("test_db.mysql.share_info_tbl"),
      generator
    )
  }

  @Singleton
  @Provides
  def providesDDLExecutor(client: JdbcClient): DDLExecutor = {
    val clusterName: String = ZConfig.getString("db.clickhouse.cluster_name")
    DDLExecutorImpl(client, ClickHouseDDLConverter(), clusterName)
  }

  @Singleton
  @Provides
  def providesSchemaMetadataStorage(ssdb: SSDB): SchemaMetadataStorage = {
    val allDbName = ZConfig.getString("ssdb_key.database.all_database", "di.databases")
    val prefixKey = ZConfig.getString("ssdb_key.database.prefix_db_key", "di")
    SchemaMetadataStorageImpl(ssdb, SsdbKVS(allDbName, ssdb), prefixKey)
  }

  @Singleton
  @Provides
  def providesSchemaMetadataStorage(
      ddlExecutor: DDLExecutor,
      schemaStorage: SchemaMetadataStorage
  ): SchemaRepository = {
    SchemaRepositoryImpl(ddlExecutor, schemaStorage)
  }

  @Singleton
  @Provides
  def providesDataRepository(client: JdbcClient): DataRepository = {
    ClickHouseDataRepository(client)
  }

  @Singleton
  @Provides
  def providesSchemaService(
      schemaRepository: SchemaRepository,
      orgAuthorizationClientService: OrgAuthorizationClientService,
      profileService: ProfileClientService
  ): SchemaService = {
    SchemaServiceImpl(
      schemaRepository = schemaRepository,
      createDbValidator = CreateDBValidator(schemaRepository),
      orgAuthorizationClientService,
      profileService
    )
  }

  @Singleton
  @Provides
  def providesIngestionService(): IngestionService = {
    MockIngestionServiceImpl()
  }

  @Singleton
  @Provides
  def provideCsvInfoRepository(client: SSDB): CsvInfoRepository = {
    implicit val ec: ExecutionContextExecutor = ExecutionContext.global
    val dbKVS = SsdbKVS[String, CsvUploadInfo](s"di.csv_upload_info", client)

    new SsdbCsvRepository(dbKVS)
  }

  @Singleton
  @Provides
  def providesApiKeyRepository(client: SSDB): ApiKeyRepository = {
    new ApiKeyRepositoryWithCache(SSDBApiKeyRepository(client))
  }

  private def ensureMysqlSchema(): Unit = {
    val jdbcUrl: String =
      "jdbc:mysql://localhost:3306?useUnicode=true&amp&characterEncoding=UTF-8&useLegacyDatetimeCode=false&serverTimezone=Asia/Ho_Chi_Minh"
    val user: String = ZConfig.getString("test_db.mysql.username")
    val password: String = ZConfig.getString("test_db.mysql.password")
    val client: JdbcClient = NativeJdbcClient(jdbcUrl, user, password)
    val dbName: String = ZConfig.getString("test_db.mysql.dbname")
    client.executeUpdate(s"create database if not exists `$dbName`")
    val createShareTableQuery: String =
      s"""
         |CREATE TABLE IF NOT EXISTS `$dbName`.`share_info`(
         |    `id` varchar(255) NOT NULL,
         |    `organization_id` bigint(20) NOT NULL,
         |    `resource_type` varchar(255) NOT NULL,
         |    `resource_id` varchar(255) NOT NULL,
         |    `username` varchar(255) NOT NULL,
         |    `created_at` bigint(20) DEFAULT NULL,
         |    `updated_at` bigint(20) DEFAULT NULL,
         |    `created_by` varchar(255) DEFAULT NULL,
         |    `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
         |    PRIMARY KEY (`id`)
         |) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
         |""".stripMargin
    client.executeUpdate(createShareTableQuery)
  }
}
