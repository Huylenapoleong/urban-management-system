allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}

subprojects {
    if (name == "isar_flutter_libs") {
        afterEvaluate {
            val androidExt = extensions.findByName("android")
            if (androidExt != null) {
                runCatching {
                    androidExt.javaClass
                        .getMethod("setNamespace", String::class.java)
                        .invoke(androidExt, "dev.isar.isar_flutter_libs")
                }
                runCatching {
                    // Ép isar dùng SDK 36 để có lStar
                    androidExt.javaClass
                        .getMethod("compileSdkVersion", Int::class.javaPrimitiveType)
                        .invoke(androidExt, 36)
                }
            }
        }
    }
}

subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}

