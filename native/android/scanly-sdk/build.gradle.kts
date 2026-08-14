plugins {
    id("com.android.library")
    kotlin("android")
    `maven-publish`
}

group = "io.scanly"
version = "2.0.0-beta.5"

android {
    namespace = "io.scanly.sdk"
    compileSdk = 36
    ndkVersion = "27.2.12479018"

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        externalNativeBuild.cmake.arguments += listOf(
            "-DSCANLY_ENABLE_ZXING_CPP=ON",
            "-DSCANLY_FETCH_ZXING_CPP=ON",
            "-DSCANLY_BUILD_TESTS=OFF",
            "-DBUILD_SHARED_LIBS=OFF",
            "-DSCANLY_CORE_LIBRARY_TYPE=STATIC",
            "-DZXING_EXAMPLES=OFF",
            "-DZXING_UNIT_TESTS=OFF",
            "-DZXING_BLACKBOX_TESTS=OFF",
            "-DZXING_WRITERS=OFF",
            "-DZXING_C_API=OFF",
            "-DCMAKE_DISABLE_FIND_PACKAGE_Doxygen=TRUE",
        )
        ndk.abiFilters += setOf("arm64-v8a", "x86_64")
    }

    externalNativeBuild.cmake {
        path = file("src/main/cpp/CMakeLists.txt")
        version = "3.22.1"
    }
    buildFeatures { buildConfig = true }
    buildTypes { release { isMinifyEnabled = false } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    testOptions { unitTests.isReturnDefaultValues = true }
    sourceSets.getByName("androidTest").assets.srcDir("../../../fixtures/native")
    publishing { singleVariant("release") { withSourcesJar() } }
}

dependencies {
    api("androidx.camera:camera-core:1.5.0")
    api("androidx.camera:camera-camera2:1.5.0")
    api("androidx.camera:camera-lifecycle:1.5.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.2")
    implementation("androidx.core:core-ktx:1.17.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
}

publishing {
    publications {
        register<MavenPublication>("release") {
            afterEvaluate { from(components["release"]) }
            artifactId = "scanly-sdk"
        }
    }
}
