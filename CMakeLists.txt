cmake_minimum_required(VERSION 3.12)
project(RaylibZedProject CXX)

set(CMAKE_CXX_STANDARD 17)

# Find Raylib (Make sure it's installed globally or provide a path)
find_package(raylib REQUIRED)

add_executable(main main.cpp)
target_link_libraries(main PRIVATE raylib)
