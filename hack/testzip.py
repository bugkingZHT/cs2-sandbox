import gzip
import os
import argparse
from pathlib import Path

def compress_pb_file(input_file: str, output_file: str = None, overwrite: bool = False):
    """
    对指定的pb文件进行gzip压缩
    
    Args:
        input_file: 待压缩的pb文件路径
        output_file: 压缩后的输出文件路径（默认在原文件后加.gz）
        overwrite: 是否覆盖已存在的输出文件
    
    Raises:
        FileNotFoundError: 输入文件不存在
        PermissionError: 无文件操作权限
        Exception: 其他压缩过程中的异常
    """
    # 校验输入文件
    input_path = Path(input_file)
    if not input_path.exists():
        raise FileNotFoundError(f"输入文件不存在: {input_file}")
    if not input_path.is_file():
        raise ValueError(f"指定路径不是文件: {input_file}")
    if input_path.suffix.lower() != ".pb":
        print(f"警告: 输入文件不是.pb后缀，仍将继续压缩: {input_file}")

    # 处理输出文件路径
    if output_file is None:
        output_file = f"{input_file}.gz"
    output_path = Path(output_file)

    # 检查输出文件是否存在
    if output_path.exists() and not overwrite:
        raise FileExistsError(
            f"输出文件已存在: {output_file}\n"
            "使用 --overwrite 参数强制覆盖"
        )

    # 读取原文件并压缩
    try:
        file_size = input_path.stat().st_size
        print(f"开始压缩文件: {input_file} (大小: {file_size/1024:.2f} KB)")
        
        with open(input_path, 'rb') as f_in:
            with gzip.open(output_path, 'wb', compresslevel=9) as f_out:
                # 分块写入，避免大文件占用过多内存
                chunk_size = 1024 * 1024  # 1MB
                while chunk := f_in.read(chunk_size):
                    f_out.write(chunk)
        
        # 计算压缩率
        compressed_size = output_path.stat().st_size
        compression_ratio = (1 - compressed_size / file_size) * 100
        
        print(f"压缩完成！")
        print(f"输出文件: {output_file} (大小: {compressed_size/1024:.2f} KB)")
        print(f"压缩率: {compression_ratio:.2f}%")
        
    except Exception as e:
        # 出错时清理不完整的输出文件
        if output_path.exists():
            output_path.unlink()
        raise e

def main():
    # 命令行参数解析
    parser = argparse.ArgumentParser(description='对指定的pb文件进行gzip压缩')
    parser.add_argument('pb_file', help='待压缩的pb文件路径')
    parser.add_argument('-o', '--output', help='压缩后的输出文件路径（默认: 原文件.gz）')
    parser.add_argument('-f', '--overwrite', action='store_true', 
                        help='覆盖已存在的输出文件')
    
    args = parser.parse_args()
    
    try:
        compress_pb_file(args.pb_file, args.output, args.overwrite)
    except Exception as e:
        print(f"错误: {e}")
        exit(1)

if __name__ == "__main__":
    main()