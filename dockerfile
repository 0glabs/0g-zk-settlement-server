# Build Stage
FROM debian:bullseye-slim AS builder

RUN echo "Starting builder stage"

# 更新并安装必要的工具
RUN apt-get update && apt-get install -y \
    curl \
    gnupg2 \
    build-essential \
    wget \
    git \
    && rm -rf /var/lib/apt/lists/*

# 安装 Miniconda（根据系统架构选择合适的版本）
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        MINICONDA_URL="https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh"; \
    elif [ "$ARCH" = "aarch64" ]; then \
        MINICONDA_URL="https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-aarch64.sh"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    wget $MINICONDA_URL -O miniconda.sh && \
    chmod +x miniconda.sh && \
    ./miniconda.sh -b -p /opt/conda && \
    rm miniconda.sh


# 将 conda 添加到 PATH
ENV PATH="/opt/conda/bin:${PATH}"

# 创建 Python 3.8.12 环境并激活
RUN conda create -n py38 python=3.8.12 -y
ENV PATH="/opt/conda/envs/py38/bin:${PATH}"
SHELL ["/bin/bash", "-c"]

# 安装 Rustup 并安装 Rust nightly
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    && /root/.cargo/bin/rustup install nightly \
    && /root/.cargo/bin/rustup default nightly

# 安装指定版本的 Node.js (v16.20.2)
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash - \
    && apt-get install -y nodejs=16.20.2* \
    && npm install -g yarn

# 确保 Cargo 和 Rust 编译器在 PATH 中
ENV PATH="/root/.cargo/bin:${PATH}"

# 设置工作目录
WORKDIR /app

# 复制项目文件
COPY . .

RUN cargo install --git https://github.com/iden3/circom.git --rev 2eaaa6d --bin circom

# 激活 Python 环境，安装 Node.js 依赖并编译
RUN source activate py38 && \
    cd circuits && \
    wget -O pot21_final.ptau https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_21.ptau && \
    yarn install && \
    yarn compile && \
    yarn setup

RUN python3 --version 

# 编译 Rust 项目
RUN git clone https://github.com/0glabs/0g-zk-settlement-turbo-engine.git && \
    echo "Building Rust project..." && \
    cd 0g-zk-settlement-turbo-engine && \
    if [ "${ENABLE_CUDA:-false}" = "true" ]; then \
        echo "Building with CUDA support..." && \
        cargo build --release --features cuda; \
    else \
        echo "Building without CUDA support..." && \
        cargo build --release; \
    fi
RUN echo "Finished builder stage"

# Run Stage
FROM debian:bullseye-slim AS runner

RUN echo "Starting runner stage"

# 安装指定版本的 Node.js (v16.20.2)
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_16.x | bash - && \
    apt-get install -y nodejs=16.20.2* && \
    rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 从构建阶段复制编译好的文件和必要的运行时文件
COPY --from=builder /app/contract /app/contract
COPY --from=builder /app/build /app/build
COPY --from=builder /app/0g-zk-settlement-turbo-engine/target/release/lib* /app/build/
COPY --from=builder /app/src /app/src
COPY --from=builder /app/node_modules /app/node_modules

# 创建日志目录
RUN mkdir -p ./logs 

# 设置环境变量
ENV RUST_LOG=info

RUN echo "Finished runner stage"

# 启动应用程序并重定向日志，同时确保容器持续运行
CMD nohup node src/server.js > logs/prover.log 2>&1 & \
    tail -f logs/prover.log
