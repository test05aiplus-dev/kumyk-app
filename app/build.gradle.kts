plugins {
    id("com.android.application")
}

android {
    namespace = "ru.kumyk.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "ru.kumyk.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// Список аудиозаписей: всё, что лежит в assets/www/audio, попадает
// в www/audio-list.js автоматически при каждой сборке.
val audioListDir = layout.buildDirectory.dir("generated/audioList")
val generateAudioList = tasks.register("generateAudioList") {
    val src = file("src/main/assets/www/audio")
    val out = audioListDir.get().asFile
    inputs.files(fileTree(src))
    outputs.dir(out)
    doLast {
        val exts = setOf("mp3", "m4a", "ogg", "wav", "aac", "opus")
        val names = (src.listFiles() ?: emptyArray())
            .filter { it.isFile && it.extension.lowercase() in exts }
            .map { it.name }
            .sorted()
        val js = names.joinToString(",") { "\"" + it.replace("\\", "\\\\").replace("\"", "\\\"") + "\"" }
        val target = File(out, "www/audio-list.js")
        target.parentFile.mkdirs()
        target.writeText("window.AUDIO_FILES = [$js];\n", Charsets.UTF_8)
    }
}
android.sourceSets.getByName("main").assets.srcDir(audioListDir.get().asFile)
tasks.matching { it.name == "preBuild" }.configureEach { dependsOn(generateAudioList) }

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
